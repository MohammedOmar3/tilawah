// Command server runs the Quran Global API: WebSocket clock sync, presence
// counting and the cached presence snapshot.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/coder/websocket"

	"github.com/MohammedOmar3/tilawah/apps/api/internal/clock"
	"github.com/MohammedOmar3/tilawah/apps/api/internal/config"
	"github.com/MohammedOmar3/tilawah/apps/api/internal/geo"
	"github.com/MohammedOmar3/tilawah/apps/api/internal/httpapi"
	"github.com/MohammedOmar3/tilawah/apps/api/internal/limits"
	"github.com/MohammedOmar3/tilawah/apps/api/internal/presence"
	"github.com/MohammedOmar3/tilawah/apps/api/internal/telemetry"
	"github.com/MohammedOmar3/tilawah/apps/api/internal/ws"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "server:", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load(os.LookupEnv)
	if err != nil {
		return fmt.Errorf("config: %w", err)
	}
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: parseLevel(cfg.LogLevel)}))

	clk := clock.Real{}
	// Rolled-up country buckets are shown at the country centroid snapped to
	// the grid, the same point country-only listeners are located at.
	centroids := presence.CentroidFunc(func(iso2 string) (float64, float64, bool) {
		lat, lng, ok := geo.Centroid(iso2)
		if !ok {
			return 0, 0, false
		}
		lat, lng = geo.Snap(lat, lng, cfg.GridDeg)
		return lat, lng, true
	})
	registry := presence.New(cfg.KMin, centroids)
	publisher := presence.NewPublisher(registry, clk)
	recorder := telemetry.NewRecorder(clk)
	limiter := limits.New(cfg.MaxConns, cfg.MaxConnsPerIP, clk)
	hub := ws.NewHub()

	wsHandler := &ws.Handler{
		Cfg:       cfg,
		Clock:     clk,
		Registry:  registry,
		Telemetry: recorder,
		Limiter:   limiter,
		Hub:       hub,
		Locate: func(h http.Header) (geo.Cell, bool) {
			return geo.Locate(h, cfg.TrustCFHeaders, cfg.GridDeg)
		},
		Log: log,
	}
	router := httpapi.NewRouter(httpapi.Deps{
		Cfg:       cfg,
		Registry:  registry,
		Publisher: publisher,
		Telemetry: recorder,
		WS:        wsHandler,
		Log:       log,
	})
	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
	}

	pubCtx, stopPublisher := context.WithCancel(context.Background())
	defer stopPublisher()
	go publisher.Run(pubCtx, cfg.SnapshotInterval)

	sigCtx, stopSignals := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stopSignals()

	serveErr := make(chan error, 1)
	go func() { serveErr <- srv.ListenAndServe() }()
	log.Info("listening", "port", cfg.Port, "programme", cfg.ProgrammeVersion,
		"snapshotInterval", cfg.SnapshotInterval.String(), "gridDeg", cfg.GridDeg, "kMin", cfg.KMin)

	select {
	case err := <-serveErr:
		return fmt.Errorf("listen: %w", err)
	case <-sigCtx.Done():
	}

	log.Info("shutting down")
	stopPublisher()
	hub.CloseAll(websocket.StatusServiceRestart, "restart")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("shutdown: %w", err)
	}
	if err := <-serveErr; err != nil && !errors.Is(err, http.ErrServerClosed) {
		return fmt.Errorf("listen: %w", err)
	}
	log.Info("stopped")
	return nil
}

func parseLevel(s string) slog.Level {
	switch strings.ToLower(s) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

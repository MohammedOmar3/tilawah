// Command server runs the Tilawah API: WebSocket clock sync, presence
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
	"github.com/MohammedOmar3/tilawah/apps/api/internal/stats"
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
	totals, saveTotals := loadTotals(cfg.StatsFile, clk, log)
	publisher := presence.NewPublisher(registry, clk, totals)
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
	go func() {
		t := time.NewTicker(statsSaveInterval)
		defer t.Stop()
		for {
			select {
			case <-pubCtx.Done():
				return
			case <-t.C:
				saveTotals()
			}
		}
	}()

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
	saveTotals()
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

// statsSaveInterval is how often the all-time totals are written to STATS_FILE.
const statsSaveInterval = time.Minute

// loadTotals restores the all-time totals from path and returns a function
// that saves them. With no path the totals live in memory only. A file that
// cannot be read is left untouched for recovery: the totals then start from
// zero in memory and are not saved.
func loadTotals(path string, clk clock.Clock, log *slog.Logger) (*stats.Counter, func()) {
	if path == "" {
		log.Warn("STATS_FILE not set; all-time totals reset on restart")
		return stats.New(clk.Now()), func() {}
	}
	c, err := stats.Load(path, clk.Now())
	if err != nil {
		log.Error("all-time totals not loaded; keeping the file and not saving", "path", path, "err", err)
		return stats.New(clk.Now()), func() {}
	}
	log.Info("all-time totals loaded", "path", path, "since", c.Totals().Since)
	return c, func() {
		if err := c.Save(path); err != nil {
			log.Error("all-time totals not saved", "path", path, "err", err)
		}
	}
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

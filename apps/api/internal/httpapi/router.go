package httpapi

import (
	"crypto/subtle"
	"encoding/json"
	"log/slog"
	"net/http"
	"runtime"
	"slices"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/MohammedOmar3/tilawah/apps/api/internal/config"
	"github.com/MohammedOmar3/tilawah/apps/api/internal/presence"
	"github.com/MohammedOmar3/tilawah/apps/api/internal/telemetry"
)

// Deps are the router's collaborators.
type Deps struct {
	Cfg       config.Config
	Registry  *presence.Registry
	Publisher *presence.Publisher
	Telemetry *telemetry.Recorder
	WS        http.Handler
	Log       *slog.Logger
}

// NewRouter builds the HTTP API. middleware.RealIP is deliberately not used:
// the client IP is only read by the WebSocket limiter, and only hashed.
func NewRouter(d Deps) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Recoverer)

	r.Get("/healthz", Healthz)

	r.Group(func(r chi.Router) {
		r.Use(originSecret(d.Cfg.OriginSecret))
		r.Get("/v1/presence.json", presenceHandler(d))
		r.Options("/v1/presence.json", presenceHandler(d))
		r.Get("/v1/stats", statsHandler(d))
		r.Handle("/v1/ws", d.WS)
	})
	return r
}

// originSecret rejects requests without X-Origin-Auth when a secret is set,
// so only Cloudflare (which adds the header) can reach the origin.
func originSecret(secret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		if secret == "" {
			return next
		}
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			got := r.Header.Get("X-Origin-Auth")
			if subtle.ConstantTimeCompare([]byte(got), []byte(secret)) != 1 {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func presenceHandler(d Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		if origin := r.Header.Get("Origin"); origin != "" && slices.Contains(d.Cfg.AllowedOrigins, origin) {
			h.Set("Access-Control-Allow-Origin", origin)
			h.Set("Access-Control-Allow-Methods", "GET, OPTIONS")
			h.Set("Access-Control-Max-Age", "86400")
		}
		h.Add("Vary", "Origin")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		pl := d.Publisher.Latest()
		body := pl.Plain
		h.Set("Cache-Control", "public, max-age=5, s-maxage=10")
		h.Set("Content-Type", "application/json")
		h.Add("Vary", "Accept-Encoding")
		if acceptsGzip(r.Header.Get("Accept-Encoding")) {
			h.Set("Content-Encoding", "gzip")
			body = pl.Gzip
		}
		h.Set("Content-Length", strconv.Itoa(len(body)))
		_, _ = w.Write(body)
	}
}

// acceptsGzip reports whether an Accept-Encoding value allows gzip.
func acceptsGzip(v string) bool {
	for _, part := range strings.Split(v, ",") {
		name, params, _ := strings.Cut(strings.TrimSpace(part), ";")
		if !strings.EqualFold(strings.TrimSpace(name), "gzip") {
			continue
		}
		q := strings.ReplaceAll(strings.TrimSpace(params), " ", "")
		if strings.HasPrefix(q, "q=") {
			f, err := strconv.ParseFloat(q[2:], 64)
			return err == nil && f > 0
		}
		return true
	}
	return false
}

type memoryStats struct {
	AllocBytes     uint64 `json:"allocBytes"`
	HeapInuseBytes uint64 `json:"heapInuseBytes"`
	SysBytes       uint64 `json:"sysBytes"`
	NumGC          uint32 `json:"numGC"`
	Goroutines     int    `json:"goroutines"`
}

type stats struct {
	Connections int               `json:"connections"`
	Listeners   int               `json:"listeners"`
	Telemetry   telemetry.Summary `json:"telemetry"`
	Memory      memoryStats       `json:"memory"`
}

func statsHandler(d Deps) http.HandlerFunc {
	token := d.Cfg.StatsToken
	return func(w http.ResponseWriter, r *http.Request) {
		if token == "" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		got, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok || subtle.ConstantTimeCompare([]byte(got), []byte(token)) != 1 {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		var ms runtime.MemStats
		runtime.ReadMemStats(&ms)
		s := stats{
			Connections: d.Registry.Connections(),
			Listeners:   d.Registry.Listeners(),
			Telemetry:   d.Telemetry.Summary(),
			Memory: memoryStats{
				AllocBytes:     ms.Alloc,
				HeapInuseBytes: ms.HeapInuse,
				SysBytes:       ms.Sys,
				NumGC:          ms.NumGC,
				Goroutines:     runtime.NumGoroutine(),
			},
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(s); err != nil {
			d.Log.Warn("encode stats", "err", err)
		}
	}
}

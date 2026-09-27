package httpapi

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"
	"time"

	"github.com/MohammedOmar3/tilawah/apps/api/internal/clock"
	"github.com/MohammedOmar3/tilawah/apps/api/internal/config"
	"github.com/MohammedOmar3/tilawah/apps/api/internal/geo"
	"github.com/MohammedOmar3/tilawah/apps/api/internal/presence"
	"github.com/MohammedOmar3/tilawah/apps/api/internal/telemetry"
)

func newRouter(t *testing.T, env map[string]string) (http.Handler, *presence.Publisher) {
	t.Helper()
	cfg, err := config.Load(func(k string) (string, bool) { v, ok := env[k]; return v, ok })
	if err != nil {
		t.Fatal(err)
	}
	clk := clock.NewFake(time.Date(2026, 9, 27, 16, 0, 0, 0, time.UTC))
	reg := presence.New(cfg.KMin, presence.CentroidFunc(geo.Centroid))
	pub := presence.NewPublisher(reg, clk)
	h := NewRouter(Deps{
		Cfg:       cfg,
		Registry:  reg,
		Publisher: pub,
		Telemetry: telemetry.NewRecorder(clk),
		WS: http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusTeapot)
		}),
		Log: slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	return h, pub
}

func do(h http.Handler, method, path string, hdr map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, nil)
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestHealthzExemptFromOriginSecret(t *testing.T) {
	h, _ := newRouter(t, map[string]string{"ORIGIN_SECRET": "s3cret"})
	rec := do(h, http.MethodGet, "/healthz", nil)
	if rec.Code != http.StatusOK || rec.Body.String() != "ok" {
		t.Fatalf("got %d %q", rec.Code, rec.Body.String())
	}
}

func TestOriginSecret(t *testing.T) {
	h, _ := newRouter(t, map[string]string{"ORIGIN_SECRET": "s3cret"})
	for _, path := range []string{"/v1/presence.json", "/v1/ws"} {
		if rec := do(h, http.MethodGet, path, nil); rec.Code != http.StatusForbidden {
			t.Fatalf("%s without secret: %d", path, rec.Code)
		}
		if rec := do(h, http.MethodGet, path, map[string]string{"X-Origin-Auth": "wrong"}); rec.Code != http.StatusForbidden {
			t.Fatalf("%s with wrong secret: %d", path, rec.Code)
		}
	}
	if rec := do(h, http.MethodGet, "/v1/presence.json", map[string]string{"X-Origin-Auth": "s3cret"}); rec.Code != http.StatusOK {
		t.Fatalf("with secret: %d", rec.Code)
	}
	if rec := do(h, http.MethodGet, "/v1/ws", map[string]string{"X-Origin-Auth": "s3cret"}); rec.Code != http.StatusTeapot {
		t.Fatalf("ws with secret: %d", rec.Code)
	}
}

func TestPresenceHeadersAndBody(t *testing.T) {
	h, pub := newRouter(t, map[string]string{"ALLOWED_ORIGINS": "https://quran.example, http://localhost:3000"})
	rec := do(h, http.MethodGet, "/v1/presence.json", map[string]string{"Origin": "https://quran.example"})
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	hd := rec.Header()
	if got := hd.Get("Cache-Control"); got != "public, max-age=5, s-maxage=10" {
		t.Errorf("Cache-Control = %q", got)
	}
	if got := hd.Get("Content-Type"); got != "application/json" {
		t.Errorf("Content-Type = %q", got)
	}
	if !slices.Contains(hd.Values("Vary"), "Accept-Encoding") {
		t.Errorf("Vary = %v", hd.Values("Vary"))
	}
	if got := hd.Get("Access-Control-Allow-Origin"); got != "https://quran.example" {
		t.Errorf("ACAO = %q", got)
	}
	if hd.Get("Content-Encoding") != "" {
		t.Errorf("unexpected Content-Encoding %q", hd.Get("Content-Encoding"))
	}
	if !bytes.Equal(rec.Body.Bytes(), pub.Latest().Plain) {
		t.Errorf("body = %s", rec.Body.Bytes())
	}

	rec = do(h, http.MethodGet, "/v1/presence.json", map[string]string{"Origin": "https://evil.example", "Accept-Encoding": "br, gzip"})
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("ACAO for disallowed origin = %q", got)
	}
	if got := rec.Header().Get("Content-Encoding"); got != "gzip" {
		t.Errorf("Content-Encoding = %q", got)
	}
	if !bytes.Equal(rec.Body.Bytes(), pub.Latest().Gzip) {
		t.Error("body is not the pre-built gzip bytes")
	}

	rec = do(h, http.MethodGet, "/v1/presence.json", map[string]string{"Accept-Encoding": "gzip;q=0"})
	if rec.Header().Get("Content-Encoding") != "" {
		t.Error("gzip served although q=0")
	}
}

func TestStats(t *testing.T) {
	h, _ := newRouter(t, nil)
	if rec := do(h, http.MethodGet, "/v1/stats", nil); rec.Code != http.StatusNotFound {
		t.Fatalf("disabled stats: %d", rec.Code)
	}

	h, _ = newRouter(t, map[string]string{"STATS_TOKEN": "tok"})
	for _, auth := range []string{"", "Bearer nope", "tok", "Basic tok"} {
		if rec := do(h, http.MethodGet, "/v1/stats", map[string]string{"Authorization": auth}); rec.Code != http.StatusUnauthorized {
			t.Fatalf("auth %q: %d", auth, rec.Code)
		}
	}
	rec := do(h, http.MethodGet, "/v1/stats", map[string]string{"Authorization": "Bearer tok"})
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control = %q", got)
	}
	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Errorf("Content-Type = %q", got)
	}
	var body map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	for _, k := range []string{"connections", "listeners", "telemetry", "memory"} {
		if _, ok := body[k]; !ok {
			t.Errorf("stats missing %q: %s", k, rec.Body.Bytes())
		}
	}
}

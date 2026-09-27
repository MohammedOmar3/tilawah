package integration_test

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
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

const secret = "s3cret"

type presenceDoc struct {
	V         int             `json:"v"`
	Listeners int             `json:"listeners"`
	Countries int             `json:"countries"`
	Cells     []presence.Cell `json:"cells"`
	Joins     []presence.Cell `json:"joins"`
}

type server struct {
	srv *httptest.Server
	clk *clock.Fake
	reg *presence.Registry
	pub *presence.Publisher
}

func start(t *testing.T) *server {
	t.Helper()
	env := map[string]string{"TRUST_CF_HEADERS": "true", "K_MIN": "2", "ORIGIN_SECRET": secret}
	cfg, err := config.Load(func(k string) (string, bool) { v, ok := env[k]; return v, ok })
	if err != nil {
		t.Fatal(err)
	}
	clk := clock.NewFake(time.Date(2026, 9, 27, 16, 0, 0, 0, time.UTC))
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	reg := presence.New(cfg.KMin, presence.CentroidFunc(geo.Centroid))
	pub := presence.NewPublisher(reg, clk)
	tel := telemetry.NewRecorder(clk)
	wsh := &ws.Handler{
		Cfg:       cfg,
		Clock:     clk,
		Registry:  reg,
		Telemetry: tel,
		Limiter:   limits.New(cfg.MaxConns, cfg.MaxConnsPerIP, clk),
		Hub:       ws.NewHub(),
		Locate: func(h http.Header) (geo.Cell, bool) {
			return geo.Locate(h, cfg.TrustCFHeaders, cfg.GridDeg)
		},
		Log: log,
	}
	srv := httptest.NewServer(httpapi.NewRouter(httpapi.Deps{
		Cfg: cfg, Registry: reg, Publisher: pub, Telemetry: tel, WS: wsh, Log: log,
	}))
	t.Cleanup(srv.Close)
	return &server{srv: srv, clk: clk, reg: reg, pub: pub}
}

func (s *server) dial(t *testing.T, located bool) *websocket.Conn {
	t.Helper()
	h := http.Header{"Origin": {"http://localhost:3000"}, "X-Origin-Auth": {secret}}
	// Every client sends location headers; the anonymous one must be ignored.
	h.Set("cf-ipcountry", "AE")
	h.Set("cf-iplatitude", "25.2")
	h.Set("cf-iplongitude", "55.3")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	c, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(s.srv.URL, "http")+"/v1/ws", &websocket.DialOptions{HTTPHeader: h})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = c.CloseNow() })

	write(t, c, map[string]any{"t": "hello", "v": 1, "anon": !located, "programme": "dev"})
	if m := read(t, c); m["t"] != "welcome" {
		t.Fatalf("expected welcome, got %v", m)
	}
	for i := 0; i < 8; i++ {
		s.clk.Advance(100 * time.Millisecond)
		write(t, c, map[string]any{"t": "ping", "id": i, "c": float64(i) * 100})
		if m := read(t, c); m["t"] != "pong" || m["id"] != float64(i) {
			t.Fatalf("expected pong %d, got %v", i, m)
		}
	}
	write(t, c, map[string]any{"t": "state", "playing": true})
	write(t, c, map[string]any{"t": "ping", "id": 99, "c": 0})
	read(t, c) // pong 99: state has been processed
	return c
}

func write(t *testing.T, c *websocket.Conn, v any) {
	t.Helper()
	b, _ := json.Marshal(v)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := c.Write(ctx, websocket.MessageText, b); err != nil {
		t.Fatal(err)
	}
}

func read(t *testing.T, c *websocket.Conn) map[string]any {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, b, err := c.Read(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatal(err)
	}
	return m
}

func (s *server) presence(t *testing.T) presenceDoc {
	t.Helper()
	s.pub.Build(s.clk.Now())
	req, _ := http.NewRequest(http.MethodGet, s.srv.URL+"/v1/presence.json", nil)
	req.Header.Set("X-Origin-Auth", secret)
	resp, err := s.srv.Client().Do(req) // transparently gunzips
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status %d", resp.StatusCode)
	}
	var d presenceDoc
	if err := json.NewDecoder(resp.Body).Decode(&d); err != nil {
		t.Fatal(err)
	}
	return d
}

func TestEndToEnd(t *testing.T) {
	s := start(t)
	a := s.dial(t, true)
	s.dial(t, true)
	s.dial(t, false)

	d := s.presence(t)
	want := []presence.Cell{{Lat: 25.5, Lng: 55.5, N: 2}}
	if d.V != 1 || d.Listeners != 3 || d.Countries != 1 || !reflect.DeepEqual(d.Cells, want) || !reflect.DeepEqual(d.Joins, want) {
		t.Fatalf("presence = %+v", d)
	}

	_ = a.Close(websocket.StatusNormalClosure, "")
	deadline := time.Now().Add(3 * time.Second)
	for s.reg.Connections() != 2 {
		if time.Now().After(deadline) {
			t.Fatal("closed client was not removed")
		}
		time.Sleep(5 * time.Millisecond)
	}
	s.clk.Advance(10 * time.Second)
	d = s.presence(t)
	if d.Listeners != 2 || d.Countries != 1 || len(d.Cells) != 0 || len(d.Joins) != 0 {
		t.Fatalf("presence after close = %+v", d)
	}
}

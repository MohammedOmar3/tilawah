package ws

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"

	"github.com/MohammedOmar3/tilawah/apps/api/internal/clock"
	"github.com/MohammedOmar3/tilawah/apps/api/internal/config"
	"github.com/MohammedOmar3/tilawah/apps/api/internal/geo"
	"github.com/MohammedOmar3/tilawah/apps/api/internal/limits"
	"github.com/MohammedOmar3/tilawah/apps/api/internal/presence"
	"github.com/MohammedOmar3/tilawah/apps/api/internal/telemetry"
)

var epoch = time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC) // 1788220800000 ms

type fixture struct {
	h        *Handler
	srv      *httptest.Server
	clk      *clock.Fake
	reg      *presence.Registry
	tel      *telemetry.Recorder
	locCalls *atomic.Int64
}

func newFixture(t *testing.T, mutate func(*Handler)) *fixture {
	t.Helper()
	cfg, err := config.Load(func(string) (string, bool) { return "", false })
	if err != nil {
		t.Fatal(err)
	}
	clk := clock.NewFake(epoch)
	reg := presence.New(cfg.KMin, presence.CentroidFunc(geo.Centroid))
	tel := telemetry.NewRecorder(clk)
	calls := &atomic.Int64{}
	h := &Handler{
		Cfg:       cfg,
		Clock:     clk,
		Registry:  reg,
		Telemetry: tel,
		Limiter:   limits.New(cfg.MaxConns, cfg.MaxConnsPerIP, clk),
		Hub:       NewHub(),
		Locate: func(http.Header) (geo.Cell, bool) {
			calls.Add(1)
			return geo.Cell{Country: "AE", Lat: 25.5, Lng: 55.5}, true
		},
		Log:          slog.New(slog.NewTextHandler(io.Discard, nil)),
		HelloTimeout: 5 * time.Second,
		IdleTimeout:  120 * time.Second,
	}
	if mutate != nil {
		mutate(h)
	}
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	return &fixture{h: h, srv: srv, clk: clk, reg: reg, tel: tel, locCalls: calls}
}

func (f *fixture) dial(t *testing.T) *websocket.Conn {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	c, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(f.srv.URL, "http"), &websocket.DialOptions{
		HTTPHeader: http.Header{"Origin": {"http://localhost:3000"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = c.CloseNow() })
	return c
}

func send(t *testing.T, c *websocket.Conn, v any) {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	sendRaw(t, c, b)
}

func sendRaw(t *testing.T, c *websocket.Conn, b []byte) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := c.Write(ctx, websocket.MessageText, b); err != nil {
		t.Fatal(err)
	}
}

func recv(t *testing.T, c *websocket.Conn) map[string]any {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, b, err := c.Read(ctx)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatal(err)
	}
	return m
}

// expectClose reads until the connection closes and returns the close status.
func expectClose(t *testing.T, c *websocket.Conn) websocket.StatusCode {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	for {
		_, _, err := c.Read(ctx)
		if err != nil {
			if ctx.Err() != nil {
				t.Fatal("connection was not closed")
			}
			return websocket.CloseStatus(err)
		}
	}
}

func hello(anon bool, programme string) map[string]any {
	return map[string]any{"t": "hello", "v": 1, "anon": anon, "programme": programme}
}

func waitFor(t *testing.T, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatal("condition not met in time")
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func TestHelloAndPing(t *testing.T) {
	f := newFixture(t, nil)
	c := f.dial(t)
	send(t, c, hello(false, "dev"))
	w := recv(t, c)
	if w["t"] != "welcome" || w["v"] != 1.0 || w["programme"] != "dev" || w["s"] != 1788220800000.0 {
		t.Fatalf("welcome = %v", w)
	}
	f.clk.Advance(1500 * time.Microsecond)
	send(t, c, map[string]any{"t": "ping", "id": 1, "c": 5})
	p := recv(t, c)
	if p["t"] != "pong" || p["id"] != 1.0 || p["c"] != 5.0 || p["s"] != 1788220800001.5 {
		t.Fatalf("pong = %v", p)
	}
}

func TestProgrammeMismatch(t *testing.T) {
	f := newFixture(t, nil)
	c := f.dial(t)
	send(t, c, hello(false, "old"))
	if w := recv(t, c); w["t"] != "welcome" {
		t.Fatalf("first = %v", w)
	}
	if p := recv(t, c); p["t"] != "programme" || p["version"] != "dev" {
		t.Fatalf("second = %v", p)
	}
}

func TestNoHelloCloses(t *testing.T) {
	f := newFixture(t, func(h *Handler) { h.HelloTimeout = 100 * time.Millisecond })
	c := f.dial(t)
	if code := expectClose(t, c); code != websocket.StatusPolicyViolation {
		t.Fatalf("close code = %d", code)
	}
}

func TestFirstMessageMustBeHello(t *testing.T) {
	f := newFixture(t, nil)
	c := f.dial(t)
	send(t, c, map[string]any{"t": "ping", "id": 1, "c": 5})
	if code := expectClose(t, c); code != websocket.StatusPolicyViolation {
		t.Fatalf("close code = %d", code)
	}
}

func TestIdleTimeoutCloses(t *testing.T) {
	f := newFixture(t, func(h *Handler) { h.IdleTimeout = 100 * time.Millisecond })
	c := f.dial(t)
	send(t, c, hello(true, "dev"))
	recv(t, c)
	if code := expectClose(t, c); code != websocket.StatusPolicyViolation {
		t.Fatalf("close code = %d", code)
	}
}

func TestNoReplyToHbStateStat(t *testing.T) {
	f := newFixture(t, nil)
	c := f.dial(t)
	send(t, c, hello(false, "dev"))
	recv(t, c)
	send(t, c, map[string]any{"t": "hb"})
	send(t, c, map[string]any{"t": "state", "playing": true})
	send(t, c, map[string]any{"t": "stat", "rttMs": 80, "offsetMs": -12.5, "errMs": 18})
	send(t, c, map[string]any{"t": "nope"})
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	if _, b, err := c.Read(ctx); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected no reply, got %s / %v", b, err)
	}
}

func TestStateCountsListenerUntilDisconnect(t *testing.T) {
	f := newFixture(t, nil)
	c := f.dial(t)
	send(t, c, hello(false, "dev"))
	recv(t, c)
	send(t, c, map[string]any{"t": "state", "playing": true})
	send(t, c, map[string]any{"t": "ping", "id": 2, "c": 1})
	recv(t, c) // pong: state was processed before it
	if n := f.reg.Listeners(); n != 1 {
		t.Fatalf("listeners = %d", n)
	}
	if f.locCalls.Load() != 1 {
		t.Fatalf("locator called %d times", f.locCalls.Load())
	}
	_ = c.Close(websocket.StatusNormalClosure, "")
	waitFor(t, func() bool { return f.reg.Connections() == 0 && f.h.Limiter.Total() == 0 })
	if n := f.reg.Listeners(); n != 0 {
		t.Fatalf("listeners after disconnect = %d", n)
	}
}

func TestAnonNeverLocated(t *testing.T) {
	f := newFixture(t, nil)
	c := f.dial(t)
	send(t, c, hello(true, "dev"))
	recv(t, c)
	send(t, c, map[string]any{"t": "state", "playing": true})
	send(t, c, map[string]any{"t": "ping", "id": 1, "c": 1})
	recv(t, c)
	if n := f.locCalls.Load(); n != 0 {
		t.Fatalf("locator called %d times", n)
	}
	if n := f.reg.Listeners(); n != 1 {
		t.Fatalf("listeners = %d", n)
	}
}

func TestRateLimit(t *testing.T) {
	f := newFixture(t, nil)
	c := f.dial(t)
	send(t, c, hello(true, "dev"))
	recv(t, c)
	for i := 0; i < 20; i++ { // hello + 20 = 21 messages within 10 s
		send(t, c, map[string]any{"t": "hb"})
	}
	if code := expectClose(t, c); code != websocket.StatusPolicyViolation {
		t.Fatalf("close code = %d", code)
	}
}

func TestRateLimitWindowSlides(t *testing.T) {
	f := newFixture(t, nil)
	c := f.dial(t)
	send(t, c, hello(true, "dev"))
	recv(t, c)
	for i := 0; i < 40; i++ {
		f.clk.Advance(600 * time.Millisecond) // ~16.7 messages per 10 s
		send(t, c, map[string]any{"t": "ping", "id": i, "c": 1})
		recv(t, c)
	}
}

func TestOversizeMessageCloses(t *testing.T) {
	f := newFixture(t, nil)
	c := f.dial(t)
	send(t, c, hello(true, "dev"))
	recv(t, c)
	sendRaw(t, c, []byte(`{"t":"hb","pad":"`+strings.Repeat("x", 2048)+`"}`))
	if code := expectClose(t, c); code != websocket.StatusMessageTooBig {
		t.Fatalf("close code = %d", code)
	}
}

func TestWrongOriginRejected(t *testing.T) {
	f := newFixture(t, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, resp, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(f.srv.URL, "http"), &websocket.DialOptions{
		HTTPHeader: http.Header{"Origin": {"https://evil.example"}},
	})
	if err == nil || resp == nil || resp.StatusCode != http.StatusForbidden {
		t.Fatalf("err = %v, resp = %v", err, resp)
	}
	waitFor(t, func() bool { return f.h.Limiter.Total() == 0 })
}

func TestPerIPLimitReturns503(t *testing.T) {
	f := newFixture(t, func(h *Handler) { h.Limiter = limits.New(100, 1, h.Clock) })
	f.dial(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, resp, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(f.srv.URL, "http"), &websocket.DialOptions{
		HTTPHeader: http.Header{"Origin": {"http://localhost:3000"}},
	})
	if err == nil || resp == nil || resp.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("err = %v, resp = %v", err, resp)
	}
}

func TestStatReachesTelemetry(t *testing.T) {
	f := newFixture(t, nil)
	c := f.dial(t)
	send(t, c, hello(false, "dev"))
	recv(t, c)
	send(t, c, map[string]any{"t": "stat", "rttMs": 80, "offsetMs": -12.5, "errMs": -18})
	send(t, c, map[string]any{"t": "stat", "rttMs": 60, "offsetMs": -10.5, "errMs": 4})
	send(t, c, map[string]any{"t": "ping", "id": 1, "c": 1})
	recv(t, c)
	s := f.tel.Summary()
	if s.Count != 2 || s.RTTMs.P95 != 80 || s.AbsErrMs.P95 != 18 || s.AbsOffsetChangeMs.P50 != 2 {
		t.Fatalf("summary = %+v", s)
	}
}

func TestMalformedMessagesIgnored(t *testing.T) {
	f := newFixture(t, nil)
	c := f.dial(t)
	send(t, c, hello(false, "dev"))
	recv(t, c)
	sendRaw(t, c, []byte(`not json`))
	send(t, c, map[string]any{"t": "ping", "id": "x", "c": 1})
	send(t, c, map[string]any{"t": "ping", "id": 3, "c": 1})
	if p := recv(t, c); p["t"] != "pong" || p["id"] != 3.0 {
		t.Fatalf("got %v", p)
	}
}

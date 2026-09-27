package main

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"
)

// fakeAPI is a minimal protocol v1 server: it answers hello with welcome and
// ping with pong, records every inbound message, and counts every byte it
// writes on the wire (HTTP upgrade response and frames alike).
type fakeAPI struct {
	srv *httptest.Server

	// closeAfterHello makes the server close with 1008 right after welcome.
	closeAfterHello bool

	written atomic.Int64
	closed  chan struct{}
	once    sync.Once

	mu      sync.Mutex
	msgs    []map[string]any
	headers http.Header
}

type countingListener struct {
	net.Listener
	api *fakeAPI
}

func (l countingListener) Accept() (net.Conn, error) {
	c, err := l.Listener.Accept()
	if err != nil {
		return nil, err
	}
	return &serverConn{Conn: c, api: l.api}, nil
}

type serverConn struct {
	net.Conn
	api *fakeAPI
}

func (c *serverConn) Write(p []byte) (int, error) {
	n, err := c.Conn.Write(p)
	c.api.written.Add(int64(n))
	return n, err
}

func (c *serverConn) Close() error {
	err := c.Conn.Close()
	c.api.once.Do(func() { close(c.api.closed) })
	return err
}

func newFakeAPI(t *testing.T, closeAfterHello bool) *fakeAPI {
	t.Helper()
	api := &fakeAPI{closed: make(chan struct{}), closeAfterHello: closeAfterHello}
	api.srv = httptest.NewUnstartedServer(http.HandlerFunc(api.serve))
	api.srv.Listener = countingListener{Listener: api.srv.Listener, api: api}
	api.srv.Start()
	t.Cleanup(api.srv.Close)
	return api
}

func (a *fakeAPI) url() string { return "ws" + strings.TrimPrefix(a.srv.URL, "http") + "/v1/ws" }

func (a *fakeAPI) serve(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("X-Origin-Auth") == "reject" {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	a.mu.Lock()
	a.headers = r.Header.Clone()
	a.mu.Unlock()
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns:  []string{"localhost:3000"},
		CompressionMode: websocket.CompressionDisabled,
	})
	if err != nil {
		return
	}
	defer func() { _ = conn.CloseNow() }()
	ctx := context.Background()
	for {
		_, data, err := conn.Read(ctx)
		if err != nil {
			return
		}
		var m map[string]any
		if json.Unmarshal(data, &m) != nil {
			continue
		}
		a.mu.Lock()
		a.msgs = append(a.msgs, m)
		a.mu.Unlock()
		now := float64(time.Now().UnixNano()) / 1e6
		switch m["t"] {
		case "hello":
			b, _ := json.Marshal(map[string]any{"t": "welcome", "v": 1, "programme": "dev", "s": now})
			if conn.Write(ctx, websocket.MessageText, b) != nil {
				return
			}
			if a.closeAfterHello {
				_ = conn.Close(websocket.StatusPolicyViolation, "idle timeout")
				return
			}
		case "ping":
			b, _ := json.Marshal(map[string]any{"t": "pong", "id": m["id"], "c": m["c"], "s": now})
			if conn.Write(ctx, websocket.MessageText, b) != nil {
				return
			}
		}
	}
}

func (a *fakeAPI) received() []map[string]any {
	a.mu.Lock()
	defer a.mu.Unlock()
	return append([]map[string]any(nil), a.msgs...)
}

func (a *fakeAPI) waitClosed(t *testing.T) {
	t.Helper()
	select {
	case <-a.closed:
	case <-time.After(5 * time.Second):
		t.Fatal("server connection never closed")
	}
}

var fastSchedule = Schedule{
	Heartbeat:    100 * time.Millisecond,
	Resync:       300 * time.Millisecond,
	Stat:         200 * time.Millisecond,
	PingSpacing:  10 * time.Millisecond,
	BurstTimeout: time.Second,
}

func TestClientSpeaksProtocolLikeABrowser(t *testing.T) {
	api := newFakeAPI(t, false)
	ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
	defer cancel()

	res := RunClient(ctx, ClientConfig{
		URL:       api.url(),
		Origin:    "http://localhost:3000",
		Secret:    "s3cret",
		Programme: "dev",
		Header:    http.Header{"Cf-Ipcountry": {"AE"}},
		Schedule:  fastSchedule,
		Seed:      1,
	})
	api.waitClosed(t)

	if res.Err != nil || !res.Connected || res.Disconnected {
		t.Fatalf("result = connected %v disconnected %v err %v", res.Connected, res.Disconnected, res.Err)
	}

	api.mu.Lock()
	h := api.headers
	api.mu.Unlock()
	if h.Get("Origin") != "http://localhost:3000" || h.Get("X-Origin-Auth") != "s3cret" || h.Get("Cf-Ipcountry") != "AE" {
		t.Errorf("headers = %v", h)
	}

	msgs := api.received()
	if len(msgs) < 10 {
		t.Fatalf("only %d messages: %v", len(msgs), msgs)
	}
	if hello := msgs[0]; hello["t"] != "hello" || hello["v"] != 1.0 || hello["anon"] != false || hello["programme"] != "dev" {
		t.Errorf("first message = %v, want hello v1", hello)
	}
	for i := 1; i <= 8; i++ {
		if msgs[i]["t"] != "ping" || msgs[i]["id"] != float64(i) {
			t.Fatalf("message %d = %v, want ping id %d (8-ping join burst)", i, msgs[i], i)
		}
		if _, ok := msgs[i]["c"].(float64); !ok {
			t.Errorf("ping %d has no client time: %v", i, msgs[i])
		}
	}
	if st := msgs[9]; st["t"] != "state" || st["playing"] != true {
		t.Errorf("message 9 = %v, want state{playing:true}", st)
	}

	count := map[string]int{}
	var resyncIDs []float64
	for _, m := range msgs[10:] {
		typ, _ := m["t"].(string)
		count[typ]++
		if typ == "ping" {
			id, _ := m["id"].(float64)
			resyncIDs = append(resyncIDs, id)
		}
		if typ == "stat" {
			for _, k := range []string{"rttMs", "offsetMs", "errMs"} {
				if _, ok := m[k].(float64); !ok {
					t.Errorf("stat without %s: %v", k, m)
				}
			}
		}
		if typ == "hello" || typ == "state" {
			t.Errorf("unexpected %s after joining: %v", typ, m)
		}
	}
	if count["hb"] < 5 {
		t.Errorf("hb sent %d times, want periodic heartbeats", count["hb"])
	}
	if count["stat"] < 3 {
		t.Errorf("stat sent %d times, want periodic stats", count["stat"])
	}
	if len(resyncIDs) < 3 || resyncIDs[0] != 9 || resyncIDs[1] != 10 || resyncIDs[2] != 11 {
		t.Errorf("resync ping ids = %v, want 3-ping bursts continuing from 9", resyncIDs)
	}

	if got, want := res.BytesReceived, api.written.Load(); got != want {
		t.Errorf("BytesReceived = %d, server wrote %d", got, want)
	}
	if res.JoinBytes <= 0 || res.JoinBytes >= res.BytesReceived {
		t.Errorf("JoinBytes = %d of %d", res.JoinBytes, res.BytesReceived)
	}
	if len(res.Pongs) < 11 {
		t.Errorf("recorded %d pong latencies, want at least 11", len(res.Pongs))
	}
	for _, d := range res.Pongs {
		if d <= 0 || d > time.Second {
			t.Errorf("implausible pong latency %v", d)
		}
	}
	if res.MsgsSent != int64(len(msgs)) {
		t.Errorf("MsgsSent = %d, server received %d", res.MsgsSent, len(msgs))
	}
	if res.MsgsReceived != int64(1+8+len(resyncIDs)) {
		t.Errorf("MsgsReceived = %d, want welcome + %d pongs", res.MsgsReceived, 8+len(resyncIDs))
	}
}

func TestClientReportsServerClose(t *testing.T) {
	api := newFakeAPI(t, true)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	res := RunClient(ctx, ClientConfig{URL: api.url(), Origin: "http://localhost:3000", Programme: "dev", Anon: true, Schedule: fastSchedule})
	if !res.Connected || !res.Disconnected {
		t.Fatalf("connected %v disconnected %v, want a server-side disconnect", res.Connected, res.Disconnected)
	}
	if res.CloseCode != int(websocket.StatusPolicyViolation) {
		t.Errorf("CloseCode = %d, want 1008", res.CloseCode)
	}
	if msgs := api.received(); len(msgs) == 0 || msgs[0]["anon"] != true {
		t.Errorf("hello = %v, want anon true", msgs)
	}
}

func TestClientFailsWhenRejected(t *testing.T) {
	api := newFakeAPI(t, false)
	res := RunClient(context.Background(), ClientConfig{URL: api.url(), Origin: "http://localhost:3000", Secret: "reject", Schedule: fastSchedule})
	if res.Connected || res.Err == nil {
		t.Fatalf("connected %v err %v, want a failed dial", res.Connected, res.Err)
	}
	if !errors.Is(res.Err, errDial) {
		t.Errorf("err = %v, want errDial", res.Err)
	}
}

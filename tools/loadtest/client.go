package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand/v2"
	"net"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/coder/websocket"
)

// Schedule is the client's timing (spec §4.5, §5.2). Production values are
// the flag defaults; tests compress them.
type Schedule struct {
	Heartbeat    time.Duration // hb interval (45 s)
	Resync       time.Duration // 3-ping burst interval (5 min)
	Stat         time.Duration // stat interval while playing (60 s)
	PingSpacing  time.Duration // gap between pings in a burst (100 ms)
	BurstTimeout time.Duration // give up waiting for a burst's pongs (3 s)
}

// ClientConfig describes one simulated listener.
type ClientConfig struct {
	URL       string
	Origin    string
	Secret    string      // sent as X-Origin-Auth when set
	Header    http.Header // extra handshake headers (fake cf-* location)
	Anon      bool
	Programme string
	Schedule  Schedule
	Seed      uint64
	Live      *LiveCounts // optional progress counters
}

// LiveCounts are updated as clients join and drop, for progress output.
type LiveCounts struct {
	Joined, Failed, Dropped atomic.Int64
}

// Result is what one client observed. Bytes are counted on the TCP
// connection, so they include the HTTP upgrade response, WebSocket framing
// and, for wss://, TLS: everything the server billed as egress except
// TCP/IP headers.
type Result struct {
	Connected    bool // received welcome
	Disconnected bool // the connection ended before the run did
	CloseCode    int  // server close status when Disconnected, else -1
	Err          error

	ConnectedAt, JoinedAt, EndedAt time.Time

	BytesReceived, BytesSent int64
	MsgsReceived, MsgsSent   int64
	// Join* are the totals when the join (hello, welcome, 8-ping burst,
	// state) finished; the rest of the session is steady state.
	JoinBytes, JoinMsgsReceived, JoinMsgsSent int64

	Pongs []time.Duration // send-to-receipt latency of each answered ping
}

var errDial = errors.New("dial")

const (
	joinBurst    = 8
	resyncBurst  = 3
	dialTimeout  = 15 * time.Second
	closeTimeout = 5 * time.Second
)

// countingConn counts bytes crossing a client TCP connection.
type countingConn struct {
	net.Conn
	read, written *atomic.Int64
}

func (c *countingConn) Read(p []byte) (int, error) {
	n, err := c.Conn.Read(p)
	c.read.Add(int64(n))
	return n, err
}

func (c *countingConn) Write(p []byte) (int, error) {
	n, err := c.Conn.Write(p)
	c.written.Add(int64(n))
	return n, err
}

type client struct {
	cfg  ClientConfig
	conn *websocket.Conn
	rng  *rand.Rand

	read, written   atomic.Int64
	msgsIn, msgsOut atomic.Int64
	welcome         chan struct{}
	pongs           chan struct{}
	readerDone      chan struct{}
	readerErr       error
	nextPingID      int64
	mu              sync.Mutex
	pending         map[int64]time.Time
	latencies       []time.Duration
	bestRTT         time.Duration
	welcomeOnce     sync.Once
}

// RunClient connects one listener, joins like the browser does and keeps the
// session going until ctx ends, then closes normally.
func RunClient(ctx context.Context, cfg ClientConfig) Result {
	c := &client{
		cfg:        cfg,
		rng:        rand.New(rand.NewPCG(cfg.Seed, cfg.Seed^0x9e3779b97f4a7c15)),
		welcome:    make(chan struct{}),
		pongs:      make(chan struct{}, 64),
		readerDone: make(chan struct{}),
		pending:    map[int64]time.Time{},
	}
	res := c.run(ctx)
	if cfg.Live != nil {
		switch {
		case !res.Connected:
			cfg.Live.Failed.Add(1)
		case res.Disconnected:
			cfg.Live.Dropped.Add(1)
		}
	}
	return res
}

func (c *client) run(ctx context.Context) Result {
	res := Result{CloseCode: -1}
	if err := c.dial(ctx); err != nil {
		res.Err = err
		return res
	}
	res.ConnectedAt = time.Now()
	go c.readLoop()

	err := c.session(ctx, &res)
	runOver := ctx.Err() != nil
	if runOver {
		// The run ended: close the way a browser tab does.
		_ = c.conn.Close(websocket.StatusNormalClosure, "")
	} else {
		_ = c.conn.CloseNow()
	}
	<-c.readerDone
	res.EndedAt = time.Now()

	if !runOver {
		// The connection ended (or failed) on its own before the run was over.
		res.Disconnected = res.Connected
		if code := websocket.CloseStatus(c.readerErr); code != -1 {
			res.CloseCode = int(code)
		}
		res.Err = err
		if c.readerErr != nil {
			res.Err = fmt.Errorf("%w (%v)", err, c.readerErr)
		}
	}
	if !res.Connected && res.Err == nil {
		res.Err = errors.New("no welcome before the run ended")
	}

	res.BytesReceived = c.read.Load()
	res.BytesSent = c.written.Load()
	res.MsgsReceived = c.msgsIn.Load()
	res.MsgsSent = c.msgsOut.Load()
	c.mu.Lock()
	res.Pongs = c.latencies
	c.mu.Unlock()
	return res
}

func (c *client) dial(ctx context.Context) error {
	transport := &http.Transport{
		Proxy: nil,
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			conn, err := (&net.Dialer{Timeout: dialTimeout}).DialContext(ctx, network, addr)
			if err != nil {
				return nil, err
			}
			return &countingConn{Conn: conn, read: &c.read, written: &c.written}, nil
		},
		TLSHandshakeTimeout: dialTimeout,
	}
	header := http.Header{}
	for k, v := range c.cfg.Header {
		header[k] = append([]string(nil), v...)
	}
	if c.cfg.Origin != "" {
		header.Set("Origin", c.cfg.Origin)
	}
	if c.cfg.Secret != "" {
		header.Set("X-Origin-Auth", c.cfg.Secret)
	}
	dctx, cancel := context.WithTimeout(ctx, dialTimeout)
	defer cancel()
	conn, resp, err := websocket.Dial(dctx, c.cfg.URL, &websocket.DialOptions{
		HTTPClient:      &http.Client{Transport: transport},
		HTTPHeader:      header,
		CompressionMode: websocket.CompressionDisabled,
	})
	if err != nil {
		if resp != nil {
			return fmt.Errorf("%w: HTTP %d: %v", errDial, resp.StatusCode, err)
		}
		return fmt.Errorf("%w: %v", errDial, err)
	}
	conn.SetReadLimit(64 << 10)
	c.conn = conn
	return nil
}

// session runs hello → welcome → 8-ping burst → state{playing:true}, then
// heartbeats, stats and 3-ping re-syncs until ctx ends.
func (c *client) session(ctx context.Context, res *Result) error {
	if err := c.send(ctx, map[string]any{"t": "hello", "v": 1, "anon": c.cfg.Anon, "programme": c.cfg.Programme}); err != nil {
		return err
	}
	select {
	case <-c.welcome:
	case <-c.readerDone:
		return errors.New("closed before welcome")
	case <-ctx.Done():
		return ctx.Err()
	}
	res.Connected = true
	if err := c.burst(ctx, joinBurst); err != nil {
		return err
	}
	if err := c.send(ctx, map[string]any{"t": "state", "playing": true}); err != nil {
		return err
	}
	res.JoinedAt = time.Now()
	res.JoinBytes = c.read.Load()
	res.JoinMsgsReceived = c.msgsIn.Load()
	res.JoinMsgsSent = c.msgsOut.Load()
	if c.cfg.Live != nil {
		c.cfg.Live.Joined.Add(1)
	}

	s := c.cfg.Schedule
	hb := time.NewTicker(s.Heartbeat)
	defer hb.Stop()
	resync := time.NewTicker(s.Resync)
	defer resync.Stop()
	stat := time.NewTicker(s.Stat)
	defer stat.Stop()
	for {
		var err error
		select {
		case <-ctx.Done():
			return nil
		case <-c.readerDone:
			return errors.New("connection closed")
		case <-hb.C:
			err = c.send(ctx, map[string]any{"t": "hb"})
		case <-stat.C:
			c.mu.Lock()
			rtt := float64(c.bestRTT) / float64(time.Millisecond)
			c.mu.Unlock()
			err = c.send(ctx, map[string]any{
				"t":        "stat",
				"rttMs":    round1(rtt),
				"offsetMs": round1(c.rng.NormFloat64() * 5),
				"errMs":    round1(c.rng.NormFloat64() * 20),
			})
		case <-resync.C:
			err = c.burst(ctx, resyncBurst)
		}
		if err != nil {
			return err
		}
	}
}

// burst sends n pings PingSpacing apart and waits for their pongs, or
// BurstTimeout, like the browser's clock-sync burst.
func (c *client) burst(ctx context.Context, n int) error {
	s := c.cfg.Schedule
	timeout := time.NewTimer(s.BurstTimeout)
	defer timeout.Stop()
	// Drain stale pong signals from an earlier timed-out burst.
	for len(c.pongs) > 0 {
		<-c.pongs
	}
	for i := 0; i < n; i++ {
		if i > 0 {
			select {
			case <-time.After(s.PingSpacing):
			case <-ctx.Done():
				return nil
			case <-c.readerDone:
				return errors.New("connection closed")
			}
		}
		c.nextPingID++
		id := c.nextPingID
		sent := time.Now()
		c.mu.Lock()
		c.pending[id] = sent
		c.mu.Unlock()
		if err := c.send(ctx, map[string]any{"t": "ping", "id": id, "c": unixMillis(sent)}); err != nil {
			return err
		}
	}
	for got := 0; got < n; {
		select {
		case <-c.pongs:
			got++
		case <-timeout.C:
			c.mu.Lock()
			clear(c.pending)
			c.mu.Unlock()
			return nil
		case <-ctx.Done():
			return nil
		case <-c.readerDone:
			return errors.New("connection closed")
		}
	}
	return nil
}

func (c *client) send(ctx context.Context, msg map[string]any) error {
	if ctx.Err() != nil {
		return nil
	}
	b, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}
	wctx, cancel := context.WithTimeout(context.Background(), closeTimeout)
	defer cancel()
	if err := c.conn.Write(wctx, websocket.MessageText, b); err != nil {
		return fmt.Errorf("write: %w", err)
	}
	c.msgsOut.Add(1)
	return nil
}

// readLoop reads until the connection closes, timing pongs as they arrive.
func (c *client) readLoop() {
	defer close(c.readerDone)
	for {
		_, data, err := c.conn.Read(context.Background())
		at := time.Now()
		if err != nil {
			c.readerErr = err
			return
		}
		c.msgsIn.Add(1)
		var m struct {
			T  string `json:"t"`
			ID int64  `json:"id"`
		}
		if json.Unmarshal(data, &m) != nil {
			continue
		}
		switch m.T {
		case "welcome":
			c.welcomeOnce.Do(func() { close(c.welcome) })
		case "pong":
			c.mu.Lock()
			sent, ok := c.pending[m.ID]
			if ok {
				delete(c.pending, m.ID)
				rtt := at.Sub(sent)
				c.latencies = append(c.latencies, rtt)
				if c.bestRTT == 0 || rtt < c.bestRTT {
					c.bestRTT = rtt
				}
			}
			c.mu.Unlock()
			if ok {
				select {
				case c.pongs <- struct{}{}:
				default:
				}
			}
		}
	}
}

func unixMillis(t time.Time) float64 { return float64(t.UnixNano()) / 1e6 }

func round1(x float64) float64 { return float64(int64(x*10)) / 10 }

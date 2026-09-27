package ws

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/coder/websocket"

	"github.com/MohammedOmar3/tilawah/apps/api/internal/geo"
	"github.com/MohammedOmar3/tilawah/apps/api/internal/telemetry"
)

type session struct {
	h    *Handler
	conn *websocket.Conn

	// header is kept only until hello, when the location is read once and the
	// reference dropped.
	header http.Header

	sendMu sync.Mutex

	joined  atomic.Bool // read by the deadline timer goroutine
	regID   uint64
	tracker *telemetry.Tracker

	// recent holds the arrival times of the last rateMaxMessages messages (ring).
	recent  [rateMaxMessages]time.Time
	nRecent int
	head    int
}

func newSession(h *Handler, conn *websocket.Conn, header http.Header) *session {
	return &session{h: h, conn: conn, header: header, tracker: h.Telemetry.NewTracker()}
}

// errClose asks run to close the socket with a status code.
type errClose struct {
	code   websocket.StatusCode
	reason string
}

func (e errClose) Error() string { return fmt.Sprintf("close %d: %s", e.code, e.reason) }

func (s *session) run(parent context.Context) {
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	defer func() { _ = s.conn.CloseNow() }()
	defer func() {
		if s.joined.Load() {
			s.h.Registry.Leave(s.regID)
		}
	}()

	// coder/websocket drops the TCP connection without a close frame when a
	// read context expires, so the hello and idle deadlines are timers that
	// close the socket with 1008 instead.
	deadline := time.AfterFunc(s.h.helloTimeout(), func() {
		reason := "idle timeout"
		if !s.joined.Load() {
			reason = "hello timeout"
		}
		_ = s.conn.Close(websocket.StatusPolicyViolation, reason)
	})
	defer deadline.Stop()

	for {
		typ, data, err := s.conn.Read(ctx)
		now := s.h.Clock.Now() // server receipt time, captured immediately
		if err != nil {
			return
		}
		if err := s.handle(ctx, now, typ, data); err != nil {
			if ce, ok := err.(errClose); ok {
				_ = s.conn.Close(ce.code, ce.reason)
			}
			return
		}
		if s.joined.Load() {
			deadline.Reset(s.h.idleTimeout())
		}
	}
}

func (s *session) handle(ctx context.Context, now time.Time, typ websocket.MessageType, data []byte) error {
	if !s.allow(now) {
		return errClose{websocket.StatusPolicyViolation, "rate limit"}
	}
	if typ != websocket.MessageText {
		return errClose{websocket.StatusUnsupportedData, "text frames only"}
	}
	var env envelope
	if err := json.Unmarshal(data, &env); err != nil {
		return nil // malformed: ignore
	}

	if !s.joined.Load() {
		if env.T != "hello" {
			return errClose{websocket.StatusPolicyViolation, "expected hello"}
		}
		var m helloMsg
		if err := json.Unmarshal(data, &m); err != nil || m.V != ProtocolVersion {
			return errClose{websocket.StatusPolicyViolation, "unsupported hello"}
		}
		return s.hello(ctx, now, m)
	}

	switch env.T {
	case "ping":
		var m pingMsg
		if err := json.Unmarshal(data, &m); err != nil {
			return nil
		}
		return s.send(ctx, pongMsg{T: "pong", ID: m.ID, C: m.C, S: millis(now)})
	case "state":
		var m stateMsg
		if err := json.Unmarshal(data, &m); err != nil {
			return nil
		}
		s.h.Registry.SetPlaying(s.regID, m.Playing)
	case "stat":
		var m statMsg
		if err := json.Unmarshal(data, &m); err != nil {
			return nil
		}
		s.tracker.Add(m.RTTMs, m.OffsetMs, m.ErrMs)
	}
	// hb, repeated hello and unknown types: no reply.
	return nil
}

func (s *session) hello(ctx context.Context, now time.Time, m helloMsg) error {
	var cell *geo.Cell
	if !m.Anon && s.h.Locate != nil {
		if c, ok := s.h.Locate(s.header); ok {
			cell = &c
		}
	}
	s.header = nil
	id := s.h.Registry.Join(cell, m.Anon)

	s.regID = id
	s.joined.Store(true)

	if err := s.send(ctx, welcomeMsg{T: "welcome", V: ProtocolVersion, Programme: s.h.Cfg.ProgrammeVersion, S: millis(now)}); err != nil {
		return err
	}
	if m.Programme != s.h.Cfg.ProgrammeVersion {
		return s.send(ctx, programmeMsg{T: "programme", Version: s.h.Cfg.ProgrammeVersion})
	}
	return nil
}

// allow records a message at now and reports whether the sender is within
// rateMaxMessages per rateWindow.
func (s *session) allow(now time.Time) bool {
	if s.nRecent == rateMaxMessages && now.Sub(s.recent[s.head]) < rateWindow {
		return false
	}
	s.recent[s.head] = now
	s.head = (s.head + 1) % rateMaxMessages
	if s.nRecent < rateMaxMessages {
		s.nRecent++
	}
	return true
}

// send writes one JSON message; safe for concurrent use.
func (s *session) send(ctx context.Context, v any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}
	s.sendMu.Lock()
	defer s.sendMu.Unlock()
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	if err := s.conn.Write(ctx, websocket.MessageText, b); err != nil {
		return fmt.Errorf("write: %w", err)
	}
	return nil
}

// millis returns t as fractional Unix milliseconds without float64 rounding
// of the full nanosecond count.
func millis(t time.Time) float64 {
	return float64(t.UnixMilli()) + float64(t.Nanosecond()%int(time.Millisecond))/1e6
}

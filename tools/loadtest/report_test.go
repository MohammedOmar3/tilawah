package main

import (
	"bytes"
	"errors"
	"math"
	"strings"
	"testing"
	"time"
)

func near(a, b float64) bool { return math.Abs(a-b) < 1e-6*math.Max(1, math.Abs(b)) }

func TestSummarize(t *testing.T) {
	t0 := time.Date(2026, 9, 27, 12, 0, 0, 0, time.UTC)
	var pongs []time.Duration
	for i := 1; i <= 100; i++ {
		pongs = append(pongs, time.Duration(i)*time.Millisecond)
	}
	client := func(bytes int64, pongs []time.Duration) Result {
		return Result{
			Connected:   true,
			ConnectedAt: t0, JoinedAt: t0, EndedAt: t0.Add(2 * time.Minute),
			BytesReceived: bytes, JoinBytes: 600,
			MsgsReceived: 10, JoinMsgsReceived: 9,
			MsgsSent: 30, JoinMsgsSent: 10,
			Pongs: pongs,
		}
	}
	results := []Result{
		client(1200, pongs[:50]),
		client(2400, pongs[50:]),
		{Err: errors.New("dial: refused")},
	}
	results[1].Disconnected = true

	a := DefaultAssumptions()
	s := Summarize(results, a)

	if s.Clients != 3 || s.Connected != 2 || s.Failed != 1 || s.Disconnected != 1 {
		t.Errorf("counts = %+v", s)
	}
	if s.PongP50 != 50*time.Millisecond || s.PongP95 != 95*time.Millisecond || s.PongP99 != 99*time.Millisecond {
		t.Errorf("pong p50/p95/p99 = %v/%v/%v", s.PongP50, s.PongP95, s.PongP99)
	}
	if s.BytesReceived != 3600 || !near(s.ClientMinutes, 4) || !near(s.BytesPerClientMin, 900) {
		t.Errorf("bytes %d over %v client-min = %v/min", s.BytesReceived, s.ClientMinutes, s.BytesPerClientMin)
	}
	// egressGB/month = perClientBytesPerMin × 60 × 24 × 30 × 5000 / 1e9
	if !near(s.EgressGBMonth, 194.4) || !near(s.EgressUSD, 9.72) {
		t.Errorf("egress = %v GB $%v", s.EgressGBMonth, s.EgressUSD)
	}
	// one 5 KB body per 10 s per tier, 5 tiers, 30 days
	if !near(s.SnapshotGBMonth, 6.48) || !near(s.SnapshotUSD, 0.324) {
		t.Errorf("snapshot = %v GB $%v", s.SnapshotGBMonth, s.SnapshotUSD)
	}
	if !near(s.TotalUSD, 9.72+0.324) {
		t.Errorf("total = $%v", s.TotalUSD)
	}

	// Wire model: steady bytes + per-session join cost (incl. a TLS handshake)
	// + TCP/IP and TLS record overhead per server packet + an ACK per client message.
	if !near(s.SteadyBytesPerMin, 600) || !near(s.JoinBytesAvg, 600) {
		t.Errorf("steady %v/min join %v", s.SteadyBytesPerMin, s.JoinBytesAvg)
	}
	wantWire := 600 + (600+5000+9*74+10*52)/30.0 + 0.5*74 + 10*52
	if !near(s.WireBytesPerMin, wantWire) {
		t.Errorf("wire = %v/min, want %v", s.WireBytesPerMin, wantWire)
	}
	if !near(s.WireGBMonth, wantWire*43200*5000/1e9) {
		t.Errorf("wire GB = %v", s.WireGBMonth)
	}

	var buf bytes.Buffer
	s.Write(&buf, a)
	for _, want := range []string{"connected", "p99", "bytes/client/min", "$"} {
		if !strings.Contains(buf.String(), want) {
			t.Errorf("report lacks %q:\n%s", want, buf.String())
		}
	}
}

func TestSummarizeUsesMeasuredSnapshotWhenLarger(t *testing.T) {
	a := DefaultAssumptions()
	a.MeasuredSnapshotBytes = 10000
	s := Summarize(nil, a)
	if !near(s.SnapshotGBMonth, 12.96) {
		t.Errorf("snapshot GB = %v, want the measured 10 KB body", s.SnapshotGBMonth)
	}
	if s.BytesPerClientMin != 0 || s.PongP99 != 0 {
		t.Errorf("empty run = %+v", s)
	}
}

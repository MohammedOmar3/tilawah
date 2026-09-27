package main

import (
	"fmt"
	"io"
	"math"
	"slices"
	"time"
)

// minutesPerMonth is 60 × 24 × 30.
const minutesPerMonth = 60 * 24 * 30

// Assumptions turn a measured run into a monthly Railway egress estimate.
type Assumptions struct {
	Listeners  int     // always-on listeners to project for (5,000, spec S7)
	PricePerGB float64 // Railway egress, USD per GB

	// Presence snapshot: one gzip body per interval per Cloudflare upper tier.
	SnapshotBytes         int // assumed body size
	MeasuredSnapshotBytes int // measured during the run; used when larger
	SnapshotTiers         int
	SnapshotInterval      time.Duration

	// Wire model on top of the bytes counted on the socket.
	Session           time.Duration // average listening session (join cost amortised over it)
	TLSHandshakeBytes int           // server's share of a TLS handshake (certificate chain)
	TCPIPOverhead     int           // IPv4 + TCP (with timestamps) header bytes per packet
	TLSRecordOverhead int           // TLS 1.3 record header + tag per message
	TLSMeasured       bool          // the run used wss://, so TLS bytes were already counted
}

// DefaultAssumptions are the plan's numbers: 5,000 listeners at $0.05/GB, a
// ~5 KB snapshot every 10 s to 5 tiers, and 30-minute sessions over plain ws://.
func DefaultAssumptions() Assumptions {
	return Assumptions{
		Listeners:         5000,
		PricePerGB:        0.05,
		SnapshotBytes:     5000,
		SnapshotTiers:     5,
		SnapshotInterval:  10 * time.Second,
		Session:           30 * time.Minute,
		TLSHandshakeBytes: 5000,
		TCPIPOverhead:     52,
		TLSRecordOverhead: 22,
	}
}

// Summary is the aggregated result of a run.
type Summary struct {
	Clients, Connected, Failed, Disconnected int

	PongCount                 int
	PongP50, PongP95, PongP99 time.Duration

	BytesReceived     int64
	ClientMinutes     float64
	BytesPerClientMin float64 // over the whole run, join included
	EgressGBMonth     float64 // plan formula on BytesPerClientMin
	EgressUSD         float64

	SnapshotBytes   int
	SnapshotGBMonth float64
	SnapshotUSD     float64
	TotalUSD        float64 // EgressUSD + SnapshotUSD

	// Conservative wire model.
	JoinBytesAvg      float64
	SteadyBytesPerMin float64
	SteadyRecvPerMin  float64 // server → client messages per minute after joining
	SteadySentPerMin  float64 // client → server messages per minute (each costs the server an ACK)
	WireBytesPerMin   float64
	WireGBMonth       float64
	WireUSD           float64
	WireTotalUSD      float64 // WireUSD + SnapshotUSD
}

// Summarize aggregates client results under the given assumptions.
func Summarize(results []Result, a Assumptions) Summary {
	s := Summary{Clients: len(results)}
	var pongs []time.Duration
	var joinBytes, joinRecv, joinSent float64
	var steadyBytes, steadyRecv, steadySent, steadyMin float64
	for _, r := range results {
		if !r.Connected {
			s.Failed++
			continue
		}
		s.Connected++
		if r.Disconnected {
			s.Disconnected++
		}
		pongs = append(pongs, r.Pongs...)
		s.BytesReceived += r.BytesReceived
		s.ClientMinutes += r.EndedAt.Sub(r.ConnectedAt).Minutes()
		if r.JoinedAt.IsZero() {
			continue
		}
		joinBytes += float64(r.JoinBytes)
		joinRecv += float64(r.JoinMsgsReceived)
		joinSent += float64(r.JoinMsgsSent)
		steadyBytes += float64(r.BytesReceived - r.JoinBytes)
		steadyRecv += float64(r.MsgsReceived - r.JoinMsgsReceived)
		steadySent += float64(r.MsgsSent - r.JoinMsgsSent)
		steadyMin += r.EndedAt.Sub(r.JoinedAt).Minutes()
	}

	s.PongCount = len(pongs)
	slices.Sort(pongs)
	s.PongP50, s.PongP95, s.PongP99 = percentile(pongs, 0.50), percentile(pongs, 0.95), percentile(pongs, 0.99)

	monthly := func(bytesPerMin float64) (gb, usd float64) {
		gb = bytesPerMin * minutesPerMonth * float64(a.Listeners) / 1e9
		return gb, gb * a.PricePerGB
	}
	if s.ClientMinutes > 0 {
		s.BytesPerClientMin = float64(s.BytesReceived) / s.ClientMinutes
	}
	s.EgressGBMonth, s.EgressUSD = monthly(s.BytesPerClientMin)

	s.SnapshotBytes = max(a.SnapshotBytes, a.MeasuredSnapshotBytes)
	if a.SnapshotInterval > 0 {
		perMonth := float64(minutesPerMonth) * float64(time.Minute) / float64(a.SnapshotInterval)
		s.SnapshotGBMonth = float64(s.SnapshotBytes) * float64(a.SnapshotTiers) * perMonth / 1e9
	}
	s.SnapshotUSD = s.SnapshotGBMonth * a.PricePerGB
	s.TotalUSD = s.EgressUSD + s.SnapshotUSD

	joined := float64(0)
	for _, r := range results {
		if r.Connected && !r.JoinedAt.IsZero() {
			joined++
		}
	}
	if joined > 0 {
		s.JoinBytesAvg = joinBytes / joined
		joinRecv /= joined
		joinSent /= joined
	}
	if steadyMin > 0 {
		s.SteadyBytesPerMin = steadyBytes / steadyMin
		s.SteadyRecvPerMin = steadyRecv / steadyMin
		s.SteadySentPerMin = steadySent / steadyMin
	}
	perServerPacket := float64(a.TCPIPOverhead)
	handshake := float64(0)
	if !a.TLSMeasured {
		perServerPacket += float64(a.TLSRecordOverhead)
		handshake = float64(a.TLSHandshakeBytes)
	}
	ack := float64(a.TCPIPOverhead)
	joinWire := s.JoinBytesAvg + handshake + joinRecv*perServerPacket + joinSent*ack
	s.WireBytesPerMin = s.SteadyBytesPerMin + s.SteadyRecvPerMin*perServerPacket + s.SteadySentPerMin*ack
	if a.Session > 0 && joined > 0 {
		s.WireBytesPerMin += joinWire / a.Session.Minutes()
	}
	s.WireGBMonth, s.WireUSD = monthly(s.WireBytesPerMin)
	s.WireTotalUSD = s.WireUSD + s.SnapshotUSD
	return s
}

// percentile is the nearest-rank percentile of sorted values.
func percentile(sorted []time.Duration, p float64) time.Duration {
	if len(sorted) == 0 {
		return 0
	}
	i := int(math.Ceil(p*float64(len(sorted)))) - 1
	return sorted[max(0, min(i, len(sorted)-1))]
}

// Write prints the summary.
func (s Summary) Write(w io.Writer, a Assumptions) {
	ms := func(d time.Duration) string { return fmt.Sprintf("%.2f ms", float64(d)/float64(time.Millisecond)) }
	fmt.Fprintf(w, "clients:        %d (connected %d, failed %d, disconnected early %d)\n",
		s.Clients, s.Connected, s.Failed, s.Disconnected)
	fmt.Fprintf(w, "pong latency:   p50 %s, p95 %s, p99 %s (%d pongs)\n", ms(s.PongP50), ms(s.PongP95), ms(s.PongP99), s.PongCount)
	fmt.Fprintf(w, "bytes received: %d total over %.1f client-minutes\n", s.BytesReceived, s.ClientMinutes)
	fmt.Fprintf(w, "bytes/client/min: %.1f (whole run, join included)\n", s.BytesPerClientMin)
	fmt.Fprintf(w, "\nprojection for %d always-on listeners at $%.3f/GB:\n", a.Listeners, a.PricePerGB)
	fmt.Fprintf(w, "  websocket egress (measured bytes):  %8.2f GB/month  $%.2f\n", s.EgressGBMonth, s.EgressUSD)
	fmt.Fprintf(w, "  presence snapshot (%d B x %d tiers every %s): %8.2f GB/month  $%.2f\n",
		s.SnapshotBytes, a.SnapshotTiers, a.SnapshotInterval, s.SnapshotGBMonth, s.SnapshotUSD)
	fmt.Fprintf(w, "  total:                               $%.2f/month\n", s.TotalUSD)
	fmt.Fprintf(w, "\nconservative wire model (TCP/IP %d B per packet and ACK", a.TCPIPOverhead)
	if !a.TLSMeasured {
		fmt.Fprintf(w, ", TLS record %d B per message, %d B TLS handshake per session", a.TLSRecordOverhead, a.TLSHandshakeBytes)
	}
	fmt.Fprintf(w, ", join amortised over %s sessions):\n", a.Session)
	fmt.Fprintf(w, "  join %.0f B; steady %.1f B/min, %.2f msgs/min in, %.2f msgs/min out\n",
		s.JoinBytesAvg, s.SteadyBytesPerMin, s.SteadyRecvPerMin, s.SteadySentPerMin)
	fmt.Fprintf(w, "  wire bytes/client/min: %.1f  -> %8.2f GB/month  $%.2f (+ snapshot = $%.2f/month)\n",
		s.WireBytesPerMin, s.WireGBMonth, s.WireUSD, s.WireTotalUSD)
}

// Package telemetry keeps a bounded, in-memory window of client sync reports.
package telemetry

import (
	"math"
	"slices"
	"sync"
	"time"

	"github.com/MohammedOmar3/tilawah/apps/api/internal/clock"
)

const (
	// Capacity bounds the ring buffer; the oldest samples are dropped past it.
	Capacity = 50_000
	// Window is how far back Summary looks.
	Window = 10 * time.Minute

	maxRTTMs = 30_000
	maxErrMs = 600_000
)

type sample struct {
	at        time.Time
	rtt       float64
	absErr    float64
	absChange float64
	hasChange bool
}

// Recorder stores samples from every connection. It is safe for concurrent use.
type Recorder struct {
	clk clock.Clock

	mu   sync.Mutex
	buf  []sample // ring buffer, len == min(total added, Capacity)
	next int      // index of the next write once the buffer is full
}

// NewRecorder returns an empty recorder.
func NewRecorder(clk clock.Clock) *Recorder {
	return &Recorder{clk: clk}
}

// Tracker records one connection's samples and remembers its last offset so
// that offset changes are measured per connection. Not safe for concurrent use;
// each session owns its tracker.
type Tracker struct {
	r          *Recorder
	lastOffset float64
	hasOffset  bool
}

// NewTracker returns a tracker for one connection.
func (r *Recorder) NewTracker() *Tracker { return &Tracker{r: r} }

// Add records one `stat` report. Out-of-bounds or non-finite values are ignored.
func (t *Tracker) Add(rttMs, offsetMs, errMs float64) {
	if !finite(rttMs) || !finite(offsetMs) || !finite(errMs) ||
		rttMs < 0 || rttMs > maxRTTMs || math.Abs(errMs) > maxErrMs {
		return
	}
	s := sample{rtt: rttMs, absErr: math.Abs(errMs)}
	if t.hasOffset {
		s.absChange, s.hasChange = math.Abs(offsetMs-t.lastOffset), true
	}
	t.lastOffset, t.hasOffset = offsetMs, true
	t.r.add(s)
}

func (r *Recorder) add(s sample) {
	s.at = r.clk.Now()
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.buf) < Capacity {
		r.buf = append(r.buf, s)
		return
	}
	r.buf[r.next] = s
	r.next = (r.next + 1) % Capacity
}

// Quantiles are nearest-rank percentiles in milliseconds.
type Quantiles struct {
	P50 float64 `json:"p50"`
	P95 float64 `json:"p95"`
}

// Summary describes the samples within Window.
type Summary struct {
	Count             int       `json:"count"`
	RTTMs             Quantiles `json:"rttMs"`
	AbsErrMs          Quantiles `json:"absErrMs"`
	AbsOffsetChangeMs Quantiles `json:"absOffsetChangeMs"`
}

// Summary returns counts and percentiles over the last Window.
func (r *Recorder) Summary() Summary {
	cutoff := r.clk.Now().Add(-Window)
	var rtts, errs, changes []float64

	r.mu.Lock()
	for _, s := range r.buf {
		if s.at.Before(cutoff) {
			continue
		}
		rtts = append(rtts, s.rtt)
		errs = append(errs, s.absErr)
		if s.hasChange {
			changes = append(changes, s.absChange)
		}
	}
	r.mu.Unlock()

	return Summary{
		Count:             len(rtts),
		RTTMs:             quantiles(rtts),
		AbsErrMs:          quantiles(errs),
		AbsOffsetChangeMs: quantiles(changes),
	}
}

func quantiles(v []float64) Quantiles {
	if len(v) == 0 {
		return Quantiles{}
	}
	slices.Sort(v)
	return Quantiles{P50: rank(v, 0.50), P95: rank(v, 0.95)}
}

func rank(sorted []float64, p float64) float64 {
	i := int(math.Ceil(p*float64(len(sorted)))) - 1
	return sorted[max(0, min(i, len(sorted)-1))]
}

func finite(x float64) bool { return !math.IsNaN(x) && !math.IsInf(x, 0) }

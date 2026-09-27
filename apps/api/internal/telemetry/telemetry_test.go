package telemetry

import (
	"math"
	"sync"
	"testing"
	"time"

	"github.com/MohammedOmar3/tilawah/apps/api/internal/clock"
)

func newFake() *clock.Fake {
	return clock.NewFake(time.Date(2026, 9, 27, 16, 0, 0, 0, time.UTC))
}

func TestEmptySummary(t *testing.T) {
	r := NewRecorder(newFake())
	s := r.Summary()
	if s.Count != 0 || s.RTTMs != (Quantiles{}) || s.AbsErrMs != (Quantiles{}) || s.AbsOffsetChangeMs != (Quantiles{}) {
		t.Fatalf("got %+v", s)
	}
}

func TestSummaryPercentiles(t *testing.T) {
	r := NewRecorder(newFake())
	tr := r.NewTracker()
	// 100 samples: rtt 1..100, err alternating sign with magnitude 1..100,
	// offset walking by i so |offset change| is 2..100 (99 changes).
	offset := 0.0
	for i := 1; i <= 100; i++ {
		e := float64(i)
		if i%2 == 0 {
			e = -e
		}
		offset += float64(i)
		tr.Add(float64(i), offset, e)
	}
	s := r.Summary()
	if s.Count != 100 {
		t.Fatalf("count = %d", s.Count)
	}
	check := func(name string, q Quantiles, p50, p95 float64) {
		t.Helper()
		if q.P50 != p50 || q.P95 != p95 {
			t.Errorf("%s = %+v, want p50 %v p95 %v", name, q, p50, p95)
		}
	}
	check("rtt", s.RTTMs, 50, 95)
	check("err", s.AbsErrMs, 50, 95)
	check("offset change", s.AbsOffsetChangeMs, 51, 96)
}

func TestOffsetChangeIsPerConnection(t *testing.T) {
	r := NewRecorder(newFake())
	a, b := r.NewTracker(), r.NewTracker()
	a.Add(50, 100, 1)
	b.Add(50, -900, 1) // first sample of b: no change, even though a's offset differs
	a.Add(50, 103, 1)
	b.Add(50, -905, 1)
	s := r.Summary()
	if s.AbsOffsetChangeMs.P50 != 3 || s.AbsOffsetChangeMs.P95 != 5 {
		t.Fatalf("got %+v", s.AbsOffsetChangeMs)
	}
}

func TestOldSamplesExcluded(t *testing.T) {
	clk := newFake()
	r := NewRecorder(clk)
	tr := r.NewTracker()
	tr.Add(1000, 0, 1000)
	clk.Advance(10*time.Minute + time.Second)
	tr.Add(10, 0, 5)
	s := r.Summary()
	if s.Count != 1 || s.RTTMs.P50 != 10 || s.AbsErrMs.P95 != 5 {
		t.Fatalf("got %+v", s)
	}
}

func TestInsaneValuesIgnored(t *testing.T) {
	r := NewRecorder(newFake())
	tr := r.NewTracker()
	for _, v := range [][3]float64{
		{-1, 0, 0}, {30001, 0, 0}, {10, 0, 600001}, {10, 0, -600001},
		{math.NaN(), 0, 0}, {10, math.Inf(1), 0}, {10, 0, math.NaN()},
	} {
		tr.Add(v[0], v[1], v[2])
	}
	if s := r.Summary(); s.Count != 0 {
		t.Fatalf("count = %d, want 0", s.Count)
	}
	tr.Add(30000, 0, -600000) // bounds are inclusive
	if s := r.Summary(); s.Count != 1 {
		t.Fatalf("count = %d, want 1", s.Count)
	}
}

func TestCapacityDropsOldest(t *testing.T) {
	r := NewRecorder(newFake())
	tr := r.NewTracker()
	tr.Add(30000, 0, 0) // oldest; must be dropped
	for i := 0; i < Capacity; i++ {
		tr.Add(1, 0, 0)
	}
	s := r.Summary()
	if s.Count != Capacity {
		t.Fatalf("count = %d, want %d", s.Count, Capacity)
	}
	if s.RTTMs.P95 != 1 {
		t.Fatalf("oldest sample not dropped: %+v", s.RTTMs)
	}
}

func TestConcurrent(t *testing.T) {
	r := NewRecorder(newFake())
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			tr := r.NewTracker()
			for j := 0; j < 100; j++ {
				tr.Add(10, float64(j), 1)
				_ = r.Summary()
			}
		}()
	}
	wg.Wait()
	if s := r.Summary(); s.Count != 2000 {
		t.Fatalf("count = %d", s.Count)
	}
}

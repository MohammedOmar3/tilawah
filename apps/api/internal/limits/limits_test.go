package limits

import (
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/MohammedOmar3/tilawah/apps/api/internal/clock"
)

func newFake() *clock.Fake {
	return clock.NewFake(time.Date(2026, 9, 27, 16, 0, 0, 0, time.UTC))
}

func TestPerIPCap(t *testing.T) {
	l := New(100, 5, newFake())
	var keys []string
	for i := 0; i < 5; i++ {
		k, ok := l.Acquire("203.0.113.7")
		if !ok {
			t.Fatalf("acquire %d failed", i)
		}
		keys = append(keys, k)
	}
	if _, ok := l.Acquire("203.0.113.7"); ok {
		t.Fatal("6th acquire from the same IP succeeded")
	}
	if _, ok := l.Acquire("198.51.100.1"); !ok {
		t.Fatal("another IP was blocked")
	}
	l.Release(keys[0])
	if _, ok := l.Acquire("203.0.113.7"); !ok {
		t.Fatal("acquire after release failed")
	}
}

func TestGlobalCap(t *testing.T) {
	l := New(3, 5, newFake())
	for _, ip := range []string{"a", "b", "c"} {
		if _, ok := l.Acquire(ip); !ok {
			t.Fatalf("acquire %s failed", ip)
		}
	}
	if _, ok := l.Acquire("d"); ok {
		t.Fatal("acquire beyond the global cap succeeded")
	}
	if got := l.Total(); got != 3 {
		t.Fatalf("Total() = %d", got)
	}
}

func TestKeyShapeAndNoRawIP(t *testing.T) {
	l := New(100, 5, newFake())
	ip := "203.0.113.7"
	k, _ := l.Acquire(ip)
	if !regexp.MustCompile(`^[0-9a-f]{16}$`).MatchString(k) {
		t.Fatalf("key %q is not 16 hex chars", k)
	}
	for _, stored := range l.keys() {
		if strings.Contains(stored, ip) {
			t.Fatalf("limiter stores the raw IP: %q", stored)
		}
	}
	k2, _ := l.Acquire(ip)
	if k2 != k {
		t.Fatal("same IP on the same day produced different keys")
	}
}

func TestSaltRotatesDailyAndReleaseStillWorks(t *testing.T) {
	clk := newFake()
	l := New(100, 1, clk)
	k1, ok := l.Acquire("203.0.113.7")
	if !ok {
		t.Fatal("acquire failed")
	}
	clk.Advance(9 * time.Hour) // crosses UTC midnight
	k2, ok := l.Acquire("203.0.113.7")
	if !ok {
		t.Fatal("acquire after rotation failed")
	}
	if k1 == k2 {
		t.Fatal("salt did not rotate across UTC dates")
	}
	l.Release(k1)
	l.Release(k2)
	if l.Total() != 0 || len(l.keys()) != 0 {
		t.Fatalf("accounting broken after rotation: total %d keys %v", l.Total(), l.keys())
	}
	l.Release("unknown") // ignored
	if l.Total() != 0 {
		t.Fatal("releasing an unknown key changed the total")
	}
}

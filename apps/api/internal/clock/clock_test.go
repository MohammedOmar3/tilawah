package clock

import (
	"testing"
	"time"
)

func TestFakeStartsAtGivenTimeAndAdvances(t *testing.T) {
	start := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	f := NewFake(start)
	if got := f.Now(); !got.Equal(start) {
		t.Fatalf("Now() = %v, want %v", got, start)
	}
	f.Advance(1500 * time.Millisecond)
	if got, want := f.Now(), start.Add(1500*time.Millisecond); !got.Equal(want) {
		t.Fatalf("after Advance, Now() = %v, want %v", got, want)
	}
}

func TestRealIsCloseToTimeNow(t *testing.T) {
	var c Clock = Real{}
	d := time.Since(c.Now())
	if d < -time.Second || d > time.Second {
		t.Fatalf("Real{}.Now() differs from time.Now() by %v", d)
	}
}

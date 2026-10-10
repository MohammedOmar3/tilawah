// Package stats keeps the all-time listening totals shown in presence.json
// (spec §4.6) and saves them to a file so they survive restarts and deploys.
// It holds aggregates only: no connection, IP or location is ever stored.
package stats

import (
	"encoding/json"
	"fmt"
	"maps"
	"os"
	"path/filepath"
	"slices"
	"sync"
	"time"
)

// MaxGap caps the time one observation can add. The publisher observes every
// SNAPSHOT_INTERVAL; a longer gap (a stalled process) is not guessed at.
const MaxGap = time.Minute

// Totals is the public view of the counter, as published in presence.json.
type Totals struct {
	Since            string `json:"since"`
	ListeningMinutes int64  `json:"listeningMinutes"`
	PeakListeners    int    `json:"peakListeners"`
	PeakAt           string `json:"peakAt,omitempty"`
	Countries        int    `json:"countries"`
}

// file is the on-disk format. Country codes are kept so a country is counted once.
type file struct {
	V             int      `json:"v"`
	Since         string   `json:"since"`
	ListenerMs    int64    `json:"listenerMs"`
	PeakListeners int      `json:"peakListeners"`
	PeakAt        string   `json:"peakAt,omitempty"`
	Countries     []string `json:"countries"`
}

// Counter accumulates listener-time, the peak listener count and the set of
// countries listeners have been located in. It is safe for concurrent use.
type Counter struct {
	mu         sync.Mutex
	since      time.Time
	listenerMs int64
	peak       int
	peakAt     time.Time
	countries  map[string]struct{}
	last       time.Time // zero until the first observation since start or load
}

// New returns an empty counter whose totals start at since.
func New(since time.Time) *Counter {
	return &Counter{since: since.UTC(), countries: make(map[string]struct{})}
}

// Observe records that listeners were playing at now, in the given countries.
// The time since the previous observation (at most MaxGap) is credited to
// each listener; the first observation only sets the baseline.
func (c *Counter) Observe(now time.Time, listeners int, countries []string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.last.IsZero() {
		if dt := now.Sub(c.last); dt > 0 {
			c.listenerMs += int64(listeners) * min(dt, MaxGap).Milliseconds()
		}
	}
	c.last = now
	if listeners > c.peak {
		c.peak = listeners
		c.peakAt = now.UTC()
	}
	for _, cc := range countries {
		c.countries[cc] = struct{}{}
	}
}

// Totals returns the current totals.
func (c *Counter) Totals() Totals {
	c.mu.Lock()
	defer c.mu.Unlock()
	t := Totals{
		Since:            formatTime(c.since),
		ListeningMinutes: c.listenerMs / time.Minute.Milliseconds(),
		PeakListeners:    c.peak,
		Countries:        len(c.countries),
	}
	if !c.peakAt.IsZero() {
		t.PeakAt = formatTime(c.peakAt)
	}
	return t
}

// Save writes the counter to path atomically: a temporary file in the same
// directory is synced and renamed over path, so a crash leaves the old file.
func (c *Counter) Save(path string) error {
	c.mu.Lock()
	f := file{
		V:             1,
		Since:         formatTime(c.since),
		ListenerMs:    c.listenerMs,
		PeakListeners: c.peak,
		Countries:     slices.Sorted(maps.Keys(c.countries)),
	}
	if !c.peakAt.IsZero() {
		f.PeakAt = formatTime(c.peakAt)
	}
	c.mu.Unlock()

	b, err := json.Marshal(f)
	if err != nil {
		return fmt.Errorf("marshal stats: %w", err)
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".stats-*.tmp")
	if err != nil {
		return fmt.Errorf("create temp stats file: %w", err)
	}
	defer os.Remove(tmp.Name()) // no-op after a successful rename
	if _, err := tmp.Write(b); err != nil {
		tmp.Close()
		return fmt.Errorf("write stats: %w", err)
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return fmt.Errorf("sync stats: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("close stats: %w", err)
	}
	if err := os.Rename(tmp.Name(), path); err != nil {
		return fmt.Errorf("rename stats: %w", err)
	}
	return nil
}

// Load reads a counter saved by Save. A missing file starts a new counter at
// now; an unreadable or invalid file is an error, so it is never overwritten.
func Load(path string, now time.Time) (*Counter, error) {
	b, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return New(now), nil
	}
	if err != nil {
		return nil, fmt.Errorf("read stats: %w", err)
	}
	var f file
	if err := json.Unmarshal(b, &f); err != nil {
		return nil, fmt.Errorf("parse stats: %w", err)
	}
	if f.V != 1 {
		return nil, fmt.Errorf("stats file version %d, want 1", f.V)
	}
	since, err := time.Parse(time.RFC3339, f.Since)
	if err != nil {
		return nil, fmt.Errorf("stats since: %w", err)
	}
	if f.ListenerMs < 0 || f.PeakListeners < 0 {
		return nil, fmt.Errorf("stats file has negative totals")
	}
	c := New(since)
	c.listenerMs = f.ListenerMs
	c.peak = f.PeakListeners
	if f.PeakAt != "" {
		if c.peakAt, err = time.Parse(time.RFC3339, f.PeakAt); err != nil {
			return nil, fmt.Errorf("stats peakAt: %w", err)
		}
	}
	for _, cc := range f.Countries {
		c.countries[cc] = struct{}{}
	}
	return c, nil
}

func formatTime(t time.Time) string { return t.UTC().Format(time.RFC3339) }

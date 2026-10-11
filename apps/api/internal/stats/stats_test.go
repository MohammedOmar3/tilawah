package stats

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

var t0 = time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)

func TestObserveAccumulatesListeningTime(t *testing.T) {
	tests := []struct {
		name        string
		steps       []step
		wantMinutes int64
		wantPeak    int
		wantPeakAt  string
		wantCountry int
	}{
		{
			name:       "first observation only sets the baseline",
			steps:      []step{{0, 50, nil}},
			wantPeak:   50,
			wantPeakAt: "2026-10-10T12:00:00Z",
		},
		{
			name:        "listeners times elapsed time",
			steps:       []step{{0, 0, nil}, {time.Minute, 30, nil}, {2 * time.Minute, 10, []string{"AE"}}},
			wantMinutes: 40,
			wantPeak:    30,
			wantPeakAt:  "2026-10-10T12:01:00Z",
			wantCountry: 1,
		},
		{
			name:        "a long gap counts as at most one interval",
			steps:       []step{{0, 0, nil}, {time.Hour, 6, nil}},
			wantMinutes: 6,
			wantPeak:    6,
			wantPeakAt:  "2026-10-10T13:00:00Z",
		},
		{
			name:  "time going backwards adds nothing",
			steps: []step{{time.Minute, 0, nil}, {0, 9, nil}},
			// Peak still counts: it is a moment, not a duration.
			wantPeak:   9,
			wantPeakAt: "2026-10-10T12:00:00Z",
		},
		{
			name:        "countries are counted once",
			steps:       []step{{0, 1, []string{"AE", "GB"}}, {time.Minute, 1, []string{"GB", "ID"}}},
			wantMinutes: 1,
			wantPeak:    1,
			wantPeakAt:  "2026-10-10T12:00:00Z",
			wantCountry: 3,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := New(t0)
			for _, s := range tt.steps {
				c.Observe(t0.Add(s.at), s.listeners, s.countries)
			}
			got := c.Totals()
			want := Totals{Since: "2026-10-10T12:00:00Z", ListeningMinutes: tt.wantMinutes, PeakListeners: tt.wantPeak,
				PeakAt: tt.wantPeakAt, Countries: tt.wantCountry}
			if got != want {
				t.Fatalf("Totals() = %+v, want %+v", got, want)
			}
		})
	}
}

type step struct {
	at        time.Duration
	listeners int
	countries []string
}

func TestSaveAndLoadRoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "stats.json")
	c := New(t0)
	c.Observe(t0, 0, nil)
	c.Observe(t0.Add(30*time.Second), 7, []string{"AE", "GB"})
	if err := c.Save(path); err != nil {
		t.Fatal(err)
	}

	loaded, err := Load(path, t0.Add(24*time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	if got, want := loaded.Totals(), c.Totals(); got != want {
		t.Fatalf("loaded %+v, want %+v", got, want)
	}

	// The restart gap is not counted: the first observation after a load is a new baseline.
	loaded.Observe(t0.Add(time.Hour), 100, nil)
	if got := loaded.Totals().ListeningMinutes; got != c.Totals().ListeningMinutes {
		t.Fatalf("ListeningMinutes after restart = %d, want %d", got, c.Totals().ListeningMinutes)
	}
	// Sub-minute remainders survive the round trip: 3.5 + 3.5 listener-minutes = 7.
	c.Observe(t0.Add(time.Minute), 7, nil)
	loaded2 := mustRoundTrip(t, c, path)
	if got := loaded2.Totals().ListeningMinutes; got != 7 {
		t.Fatalf("ListeningMinutes = %d, want 7", got)
	}
}

func mustRoundTrip(t *testing.T, c *Counter, path string) *Counter {
	t.Helper()
	if err := c.Save(path); err != nil {
		t.Fatal(err)
	}
	l, err := Load(path, t0)
	if err != nil {
		t.Fatal(err)
	}
	return l
}

func TestLoadMissingFileStartsFresh(t *testing.T) {
	c, err := Load(filepath.Join(t.TempDir(), "stats.json"), t0)
	if err != nil {
		t.Fatal(err)
	}
	if got := c.Totals(); got != (Totals{Since: "2026-10-10T12:00:00Z"}) {
		t.Fatalf("Totals() = %+v", got)
	}
}

func TestLoadRejectsCorruptFile(t *testing.T) {
	for name, body := range map[string]string{
		"not json":        "{",
		"unknown version": `{"v":2,"since":"2026-10-10T12:00:00Z"}`,
		"bad since":       `{"v":1,"since":"yesterday"}`,
		"negative total":  `{"v":1,"since":"2026-10-10T12:00:00Z","listenerMs":-1}`,
	} {
		t.Run(name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "stats.json")
			if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
				t.Fatal(err)
			}
			if _, err := Load(path, t0); err == nil {
				t.Fatal("Load accepted a corrupt file")
			}
		})
	}
}

func TestSaveLeavesNoTempFileAndReportsErrors(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "stats.json")
	if err := New(t0).Save(path); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].Name() != "stats.json" {
		t.Fatalf("dir holds %v, want only stats.json", entries)
	}

	err = New(t0).Save(filepath.Join(dir, "missing", "stats.json"))
	if err == nil || !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("Save into a missing dir = %v, want ErrNotExist", err)
	}
}

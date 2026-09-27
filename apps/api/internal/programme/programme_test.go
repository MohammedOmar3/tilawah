package programme

import (
	"encoding/json"
	"os"
	"testing"
)

type vectorFile struct {
	Programme Programme `json:"programme"`
	Cases     []struct {
		Name         string `json:"name"`
		NowMs        int64  `json:"nowMs"`
		TrackIndex   int    `json:"trackIndex"`
		PosInTrackMs int64  `json:"posInTrackMs"`
		Loop         int64  `json:"loop"`
	} `json:"cases"`
}

func TestSharedVectors(t *testing.T) {
	raw, err := os.ReadFile("../../../../packages/contracts/fixtures/programme-vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var vf vectorFile
	if err := json.Unmarshal(raw, &vf); err != nil {
		t.Fatal(err)
	}
	if len(vf.Cases) == 0 {
		t.Fatal("no vector cases")
	}
	c, err := Compile(vf.Programme)
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range vf.Cases {
		t.Run(tc.Name, func(t *testing.T) {
			p := PositionAt(c, tc.NowMs)
			if p.TrackIndex != tc.TrackIndex || p.PosInTrackMs != tc.PosInTrackMs || p.Loop != tc.Loop {
				t.Fatalf("got track %d pos %d loop %d, want track %d pos %d loop %d",
					p.TrackIndex, p.PosInTrackMs, p.Loop, tc.TrackIndex, tc.PosInTrackMs, tc.Loop)
			}
		})
	}
}

func TestCompileRejectsBadProgrammes(t *testing.T) {
	tests := []struct {
		name string
		p    Programme
	}{
		{"zero total", Programme{Epoch: "2026-09-01T00:00:00Z", Tracks: []Track{{Surah: 1, DurationMs: 0}}}},
		{"no tracks", Programme{Epoch: "2026-09-01T00:00:00Z"}},
		{"bad epoch", Programme{Epoch: "yesterday", Tracks: []Track{{Surah: 1, DurationMs: 1000}}}},
		{"negative duration", Programme{Epoch: "2026-09-01T00:00:00Z", Tracks: []Track{{Surah: 1, DurationMs: 2000}, {Surah: 2, DurationMs: -1000}}}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := Compile(tt.p); err == nil {
				t.Fatal("expected error")
			}
		})
	}
}

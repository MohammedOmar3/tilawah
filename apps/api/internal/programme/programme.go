// Package programme is the Go port of the shared programme position math
// (packages/contracts/src/programme.ts). Both must pass the same vectors.
package programme

import (
	"errors"
	"fmt"
	"sort"
	"time"
)

// Reciter describes who recites the programme (spec §4.4).
type Reciter struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Riwayah string `json:"riwayah"`
}

// Track is one surah of the programme (spec §4.4).
type Track struct {
	Surah      int    `json:"surah"`
	DurationMs int64  `json:"durationMs"`
	Audio      string `json:"audio"`
	Timings    string `json:"timings"`
}

// Programme is programme.json (spec §4.4).
type Programme struct {
	Version string  `json:"version"`
	Epoch   string  `json:"epoch"`
	Reciter Reciter `json:"reciter"`
	Tracks  []Track `json:"tracks"`
}

// Compiled is a programme with its epoch parsed and track start offsets precomputed.
type Compiled struct {
	Programme Programme
	EpochMs   int64
	TotalMs   int64
	// Prefix[i] is the start offset of track i; Prefix[len(Tracks)] == TotalMs.
	Prefix []int64
}

// Position is where the programme is at a given instant.
type Position struct {
	TrackIndex    int
	PosInTrackMs  int64
	OffsetMs      int64
	Loop          int64
	MsToNextTrack int64
}

// Compile validates p and precomputes its offsets.
func Compile(p Programme) (Compiled, error) {
	epoch, err := time.Parse(time.RFC3339, p.Epoch)
	if err != nil {
		return Compiled{}, fmt.Errorf("parse epoch: %w", err)
	}
	prefix := make([]int64, 1, len(p.Tracks)+1)
	for i, t := range p.Tracks {
		if t.DurationMs < 0 {
			return Compiled{}, fmt.Errorf("track %d has negative duration", i)
		}
		prefix = append(prefix, prefix[len(prefix)-1]+t.DurationMs)
	}
	total := prefix[len(prefix)-1]
	if total <= 0 {
		return Compiled{}, errors.New("programme total duration must be positive")
	}
	return Compiled{Programme: p, EpochMs: epoch.UnixMilli(), TotalMs: total, Prefix: prefix}, nil
}

// PositionAt returns the programme position at nowMs (Unix milliseconds).
func PositionAt(c Compiled, nowMs int64) Position {
	elapsed := nowMs - c.EpochMs
	offset := elapsed % c.TotalMs
	if offset < 0 {
		offset += c.TotalMs
	}
	loop := elapsed / c.TotalMs
	if elapsed%c.TotalMs != 0 && elapsed < 0 {
		loop-- // floor division
	}
	// Largest i with Prefix[i] <= offset, among track starts.
	n := len(c.Prefix) - 1
	i := sort.Search(n, func(i int) bool { return c.Prefix[i] > offset }) - 1
	return Position{
		TrackIndex:    i,
		PosInTrackMs:  offset - c.Prefix[i],
		OffsetMs:      offset,
		Loop:          loop,
		MsToNextTrack: c.Prefix[i+1] - offset,
	}
}

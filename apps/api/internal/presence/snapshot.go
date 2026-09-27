package presence

import (
	"cmp"
	"slices"
)

// Cell is one shown point on the globe (spec §4.6).
type Cell struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
	N   int     `json:"n"`
}

// Snapshot is the privacy-safe aggregate of the registry.
type Snapshot struct {
	Listeners int
	Countries int
	Cells     []Cell
	Joins     []Cell
}

// Snapshot aggregates playing listeners into k-anonymous cells and computes
// joins against the previous call's shown cells, which it then replaces.
// Call it from a single place (the publisher) so joins mean "since last snapshot".
func (r *Registry) Snapshot() Snapshot {
	r.mu.Lock()
	defer r.mu.Unlock()

	listeners := 0
	byCell := make(map[cellKey]int)
	for _, e := range r.entries {
		if !e.playing {
			continue
		}
		listeners++
		if e.anon || e.cell == nil {
			continue
		}
		byCell[cellKey{e.cell.Country, e.cell.Lat, e.cell.Lng}]++
	}

	shown := make(map[point]int)
	countries := make(map[string]struct{})
	leftover := make(map[string]int)
	for k, n := range byCell {
		countries[k.country] = struct{}{}
		if n >= r.kMin {
			shown[point{k.lat, k.lng}] += n
		} else {
			leftover[k.country] += n
		}
	}
	for country, n := range leftover {
		if n < r.kMin {
			continue
		}
		if lat, lng, ok := r.centroids.Centroid(country); ok {
			shown[point{lat, lng}] += n
		}
	}

	cells := make([]Cell, 0, len(shown))
	joins := []Cell{}
	for p, n := range shown {
		cells = append(cells, Cell{p.lat, p.lng, n})
		if d := n - r.prevShown[p]; d > 0 {
			joins = append(joins, Cell{p.lat, p.lng, d})
		}
	}
	r.prevShown = shown
	sortCells(cells)
	sortCells(joins)

	return Snapshot{Listeners: listeners, Countries: len(countries), Cells: cells, Joins: joins}
}

func sortCells(cs []Cell) {
	slices.SortFunc(cs, func(a, b Cell) int {
		if c := cmp.Compare(a.Lat, b.Lat); c != 0 {
			return c
		}
		return cmp.Compare(a.Lng, b.Lng)
	})
}

// Package presence counts listeners in memory and builds k-anonymous snapshots.
package presence

import (
	"sync"
	"sync/atomic"

	"github.com/MohammedOmar3/tilawah/apps/api/internal/geo"
)

// Centroids looks up the point at which a country's rolled-up listeners are shown.
type Centroids interface {
	Centroid(iso2 string) (lat, lng float64, ok bool)
}

// CentroidFunc adapts a function to Centroids.
type CentroidFunc func(iso2 string) (lat, lng float64, ok bool)

// Centroid calls f.
func (f CentroidFunc) Centroid(iso2 string) (float64, float64, bool) { return f(iso2) }

type entry struct {
	cell    *geo.Cell // nil when anonymous or not locatable
	anon    bool
	playing bool
}

type cellKey struct {
	country  string
	lat, lng float64
}

type point struct{ lat, lng float64 }

// Registry tracks connections and whether each is playing. It stores only
// grid cells, never IPs or raw coordinates.
type Registry struct {
	kMin      int
	centroids Centroids
	nextID    atomic.Uint64

	mu        sync.Mutex
	entries   map[uint64]*entry
	prevShown map[point]int
}

// New returns an empty registry that hides buckets with fewer than kMin listeners.
func New(kMin int, centroids Centroids) *Registry {
	return &Registry{
		kMin:      kMin,
		centroids: centroids,
		entries:   make(map[uint64]*entry),
		prevShown: make(map[point]int),
	}
}

// Join registers a connection. cell may be nil; anonymous connections never keep a cell.
func (r *Registry) Join(cell *geo.Cell, anon bool) uint64 {
	id := r.nextID.Add(1)
	e := &entry{anon: anon}
	if cell != nil && !anon {
		c := *cell
		e.cell = &c
	}
	r.mu.Lock()
	r.entries[id] = e
	r.mu.Unlock()
	return id
}

// SetPlaying marks whether the connection's audio is playing. Unknown ids are ignored.
func (r *Registry) SetPlaying(id uint64, playing bool) {
	r.mu.Lock()
	if e, ok := r.entries[id]; ok {
		e.playing = playing
	}
	r.mu.Unlock()
}

// Leave removes a connection. Unknown ids are ignored.
func (r *Registry) Leave(id uint64) {
	r.mu.Lock()
	delete(r.entries, id)
	r.mu.Unlock()
}

// Connections returns the number of registered connections.
func (r *Registry) Connections() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.entries)
}

// Listeners returns the number of playing connections without advancing the join baseline.
func (r *Registry) Listeners() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	n := 0
	for _, e := range r.entries {
		if e.playing {
			n++
		}
	}
	return n
}

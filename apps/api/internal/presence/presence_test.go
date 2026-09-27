package presence

import (
	"math"
	"math/rand/v2"
	"reflect"
	"sync"
	"testing"

	"github.com/MohammedOmar3/tilawah/apps/api/internal/geo"
)

type fakeCentroids map[string][2]float64

func (f fakeCentroids) Centroid(iso2 string) (float64, float64, bool) {
	c, ok := f[iso2]
	return c[0], c[1], ok
}

func assertEq[T any](t *testing.T, got, want T) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

func joinPlaying(r *Registry, cell *geo.Cell, anon bool, n int) []uint64 {
	ids := make([]uint64, n)
	for i := range ids {
		ids[i] = r.Join(cell, anon)
		r.SetPlaying(ids[i], true)
	}
	return ids
}

func TestSnapshotCountsAndThreshold(t *testing.T) {
	r := New(5, fakeCentroids{"AE": {24.5, 54.5}, "IS": {64.5, -18.5}})
	dubai := &geo.Cell{Country: "AE", Lat: 25.5, Lng: 55.5}
	joinPlaying(r, dubai, false, 6)
	iceland := &geo.Cell{Country: "IS", Lat: 64.5, Lng: -21.5}
	joinPlaying(r, iceland, false, 2)
	joinPlaying(r, nil, true, 1)
	_ = r.Join(dubai, false) // connected, not playing

	s := r.Snapshot()
	assertEq(t, s.Listeners, 9)
	assertEq(t, s.Countries, 2)
	assertEq(t, s.Cells, []Cell{{25.5, 55.5, 6}})
	assertEq(t, r.Connections(), 10)
}

func TestRollUpToCountryCentroid(t *testing.T) {
	r := New(5, fakeCentroids{"AE": {24.5, 54.5}})
	joinPlaying(r, &geo.Cell{Country: "AE", Lat: 25.5, Lng: 55.5}, false, 3)
	joinPlaying(r, &geo.Cell{Country: "AE", Lat: 22.5, Lng: 52.5}, false, 3)

	s := r.Snapshot()
	assertEq(t, s.Listeners, 6)
	assertEq(t, s.Countries, 1)
	assertEq(t, s.Cells, []Cell{{24.5, 54.5, 6}})
}

func TestRollUpMergesWithShownCellAtSameCoordinates(t *testing.T) {
	// A cell at the centroid itself is shown; small cells roll up into the same point.
	r := New(5, fakeCentroids{"AE": {22.5, 55.5}})
	joinPlaying(r, &geo.Cell{Country: "AE", Lat: 22.5, Lng: 55.5}, false, 5)
	joinPlaying(r, &geo.Cell{Country: "AE", Lat: 25.5, Lng: 55.5}, false, 2)
	joinPlaying(r, &geo.Cell{Country: "AE", Lat: 22.5, Lng: 52.5}, false, 3)

	s := r.Snapshot()
	assertEq(t, s.Cells, []Cell{{22.5, 55.5, 10}})
}

func TestUnknownCentroidDropsBucket(t *testing.T) {
	r := New(2, fakeCentroids{})
	joinPlaying(r, &geo.Cell{Country: "ZZ", Lat: 1.5, Lng: 1.5}, false, 1)
	joinPlaying(r, &geo.Cell{Country: "ZZ", Lat: 4.5, Lng: 1.5}, false, 1)
	s := r.Snapshot()
	assertEq(t, s.Listeners, 2)
	assertEq(t, s.Cells, []Cell{})
}

func TestJoinsAreDeltasOfShownCells(t *testing.T) {
	r := New(5, fakeCentroids{})
	dubai := &geo.Cell{Country: "AE", Lat: 25.5, Lng: 55.5}
	ids := joinPlaying(r, dubai, false, 5)

	s1 := r.Snapshot()
	assertEq(t, s1.Joins, []Cell{{25.5, 55.5, 5}})

	joinPlaying(r, dubai, false, 2)
	s2 := r.Snapshot()
	assertEq(t, s2.Cells, []Cell{{25.5, 55.5, 7}})
	assertEq(t, s2.Joins, []Cell{{25.5, 55.5, 2}})

	r.Leave(ids[0])
	s3 := r.Snapshot()
	assertEq(t, s3.Cells, []Cell{{25.5, 55.5, 6}})
	assertEq(t, s3.Joins, []Cell{})

	s4 := r.Snapshot()
	assertEq(t, s4.Joins, []Cell{})
}

func TestLeaveAndNotPlaying(t *testing.T) {
	r := New(1, fakeCentroids{})
	cell := &geo.Cell{Country: "AE", Lat: 25.5, Lng: 55.5}
	a := r.Join(cell, false)
	b := r.Join(cell, false)
	r.SetPlaying(a, true)
	r.SetPlaying(b, true)
	assertEq(t, r.Snapshot().Listeners, 2)

	r.SetPlaying(b, false)
	assertEq(t, r.Snapshot().Listeners, 1)
	assertEq(t, r.Listeners(), 1)
	assertEq(t, r.Connections(), 2)

	r.Leave(a)
	s := r.Snapshot()
	assertEq(t, s.Listeners, 0)
	assertEq(t, s.Countries, 0)
	assertEq(t, s.Cells, []Cell{})
	assertEq(t, r.Connections(), 1)

	// Unknown ids are ignored.
	r.SetPlaying(999, true)
	r.Leave(999)
	assertEq(t, r.Connections(), 1)
}

func TestSnapshotHasNoRawCoordinates(t *testing.T) {
	const deg = 3.0
	cents := fakeCentroids{"AE": {23.5, 54.5}, "GB": {54.4, -2.1}, "ID": {-1.0, 101.9}}
	r := New(3, cents)
	rng := rand.New(rand.NewPCG(7, 11))
	countries := []string{"AE", "GB", "ID"}
	for i := 0; i < 500; i++ {
		lat, lng := geo.Snap(rng.Float64()*20, rng.Float64()*20, deg)
		joinPlaying(r, &geo.Cell{Country: countries[rng.IntN(3)], Lat: lat, Lng: lng}, false, 1)
	}
	isCentre := func(x float64) bool {
		m := math.Mod(x-deg/2, deg)
		return math.Abs(m) < 1e-9 || math.Abs(math.Abs(m)-deg) < 1e-9
	}
	isCentroid := func(c Cell) bool {
		for _, v := range cents {
			if v[0] == c.Lat && v[1] == c.Lng {
				return true
			}
		}
		return false
	}
	s := r.Snapshot()
	if len(s.Cells) == 0 {
		t.Fatal("expected some cells")
	}
	for _, c := range append(s.Cells, s.Joins...) {
		if !(isCentre(c.Lat) && isCentre(c.Lng)) && !isCentroid(c) {
			t.Fatalf("cell %+v is neither a grid centre nor a centroid", c)
		}
		if c.N < 1 {
			t.Fatalf("cell %+v has non-positive n", c)
		}
	}
	for _, c := range s.Cells {
		if c.N < 3 {
			t.Fatalf("cell %+v below k-min", c)
		}
	}
}

func TestSnapshotIsSorted(t *testing.T) {
	r := New(1, fakeCentroids{})
	for _, c := range []geo.Cell{
		{Country: "ID", Lat: -7.5, Lng: 106.5},
		{Country: "AE", Lat: 25.5, Lng: 55.5},
		{Country: "GB", Lat: 52.5, Lng: -1.5},
		{Country: "AE", Lat: 25.5, Lng: 52.5},
	} {
		joinPlaying(r, &c, false, 1)
	}
	assertEq(t, r.Snapshot().Cells, []Cell{{-7.5, 106.5, 1}, {25.5, 52.5, 1}, {25.5, 55.5, 1}, {52.5, -1.5, 1}})
}

func TestConcurrentUse(t *testing.T) {
	r := New(5, fakeCentroids{})
	cell := &geo.Cell{Country: "AE", Lat: 25.5, Lng: 55.5}
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			id := r.Join(cell, false)
			r.SetPlaying(id, true)
			_ = r.Snapshot()
			r.Leave(id)
		}()
	}
	wg.Wait()
	assertEq(t, r.Connections(), 0)
}

package presence

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"io"
	"testing"
	"time"

	"github.com/MohammedOmar3/tilawah/apps/api/internal/clock"
	"github.com/MohammedOmar3/tilawah/apps/api/internal/geo"
)

type presenceDoc struct {
	V           int    `json:"v"`
	GeneratedAt string `json:"generatedAt"`
	Listeners   int    `json:"listeners"`
	Countries   int    `json:"countries"`
	Cells       []Cell `json:"cells"`
	Joins       []Cell `json:"joins"`
}

func gunzip(t *testing.T, b []byte) []byte {
	t.Helper()
	zr, err := gzip.NewReader(bytes.NewReader(b))
	if err != nil {
		t.Fatal(err)
	}
	out, err := io.ReadAll(zr)
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func TestLatestBeforeFirstBuildIsEmptySnapshot(t *testing.T) {
	clk := clock.NewFake(time.Date(2026, 9, 27, 16, 0, 0, 0, time.UTC))
	p := NewPublisher(New(5, fakeCentroids{}), clk)
	pl := p.Latest()
	if pl == nil {
		t.Fatal("Latest() is nil")
	}
	for _, s := range []string{`"cells":[]`, `"joins":[]`, `"listeners":0`, `"v":1`} {
		if !bytes.Contains(pl.Plain, []byte(s)) {
			t.Fatalf("plain %s missing %s", pl.Plain, s)
		}
	}
	if !bytes.Equal(gunzip(t, pl.Gzip), pl.Plain) {
		t.Fatal("gzip bytes do not match plain bytes")
	}
}

func TestBuildMatchesSpec(t *testing.T) {
	clk := clock.NewFake(time.Date(2026, 9, 27, 16, 0, 0, 0, time.UTC))
	r := New(5, fakeCentroids{})
	joinPlaying(r, &geo.Cell{Country: "AE", Lat: 25.5, Lng: 55.5}, false, 5)
	joinPlaying(r, nil, true, 1)
	p := NewPublisher(r, clk)

	now := time.Date(2026, 9, 27, 20, 0, 0, 0, time.FixedZone("GST", 4*3600))
	p.Build(now)
	pl := p.Latest()

	var got presenceDoc
	if err := json.Unmarshal(pl.Plain, &got); err != nil {
		t.Fatal(err)
	}
	want := presenceDoc{
		V: 1, GeneratedAt: "2026-09-27T16:00:00Z", Listeners: 6, Countries: 1,
		Cells: []Cell{{25.5, 55.5, 5}}, Joins: []Cell{{25.5, 55.5, 5}},
	}
	assertEq(t, got, want)
	if !bytes.Equal(gunzip(t, pl.Gzip), pl.Plain) {
		t.Fatal("gzip bytes do not match plain bytes")
	}

	// Second build: no new joins, arrays stay non-null.
	p.Build(now.Add(10 * time.Second))
	pl2 := p.Latest()
	if pl2 == pl {
		t.Fatal("Build did not replace the payload")
	}
	if !bytes.Contains(pl2.Plain, []byte(`"joins":[]`)) {
		t.Fatalf("joins not an empty array: %s", pl2.Plain)
	}
}

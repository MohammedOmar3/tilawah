package geo

import (
	"net/http"
	"testing"
)

func hdr(kv ...string) http.Header {
	h := http.Header{}
	for i := 0; i+1 < len(kv); i += 2 {
		h.Set(kv[i], kv[i+1])
	}
	return h
}

func TestLocate(t *testing.T) {
	dubai := hdr("cf-ipcountry", "AE", "cf-iplatitude", "25.2048", "cf-iplongitude", "55.2708")
	// AE centroid (23.5, 54.5) snapped to a 3° grid.
	aeCentroidCell := Cell{Country: "AE", Lat: 22.5, Lng: 55.5}

	tests := []struct {
		name  string
		h     http.Header
		trust bool
		want  Cell
		ok    bool
	}{
		{"untrusted ignores headers", dubai, false, Cell{}, false},
		{"full headers snap to grid", dubai, true, Cell{Country: "AE", Lat: 25.5, Lng: 55.5}, true},
		{"country only uses snapped centroid", hdr("cf-ipcountry", "AE"), true, aeCentroidCell, true},
		{"lowercase country", hdr("cf-ipcountry", "ae"), true, aeCentroidCell, true},
		{"unknown country", hdr("cf-ipcountry", "XX", "cf-iplatitude", "25.2", "cf-iplongitude", "55.3"), true, Cell{}, false},
		{"tor", hdr("cf-ipcountry", "T1", "cf-iplatitude", "25.2", "cf-iplongitude", "55.3"), true, Cell{}, false},
		{"missing country", hdr("cf-iplatitude", "25.2", "cf-iplongitude", "55.3"), true, Cell{}, false},
		{"no headers", http.Header{}, true, Cell{}, false},
		{"malformed latitude falls back to centroid", hdr("cf-ipcountry", "AE", "cf-iplatitude", "north", "cf-iplongitude", "55.3"), true, aeCentroidCell, true},
		{"out of range latitude falls back to centroid", hdr("cf-ipcountry", "AE", "cf-iplatitude", "123", "cf-iplongitude", "55.3"), true, aeCentroidCell, true},
		{"NaN longitude falls back to centroid", hdr("cf-ipcountry", "AE", "cf-iplatitude", "25.2", "cf-iplongitude", "NaN"), true, aeCentroidCell, true},
		{"missing longitude falls back to centroid", hdr("cf-ipcountry", "AE", "cf-iplatitude", "25.2"), true, aeCentroidCell, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := Locate(tt.h, tt.trust, 3)
			if ok != tt.ok || got != tt.want {
				t.Fatalf("Locate = (%+v, %v), want (%+v, %v)", got, ok, tt.want, tt.ok)
			}
		})
	}
}

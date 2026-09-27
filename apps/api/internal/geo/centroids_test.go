package geo

import "testing"

func TestCentroid(t *testing.T) {
	for _, iso := range []string{"AE", "GB", "ID", "FR", "NO", "ae"} {
		lat, lng, ok := Centroid(iso)
		if !ok {
			t.Errorf("Centroid(%q) missing", iso)
			continue
		}
		if lat < -90 || lat > 90 || lng < -180 || lng > 180 {
			t.Errorf("Centroid(%q) = (%v, %v) out of range", iso, lat, lng)
		}
	}
	if lat, lng, ok := Centroid("AE"); !ok || lat != 23.5 || lng != 54.5 {
		t.Errorf("Centroid(AE) = (%v, %v, %v), want (23.5, 54.5, true)", lat, lng, ok)
	}
	for _, iso := range []string{"XX", "T1", "", "-99"} {
		if _, _, ok := Centroid(iso); ok {
			t.Errorf("Centroid(%q) should not exist", iso)
		}
	}
}

func TestCentroidTableSize(t *testing.T) {
	if n := len(centroidTable()); n < 200 || n > 260 {
		t.Fatalf("centroid table has %d rows, want ~235", n)
	}
}

package geo

import (
	"math/rand/v2"
	"testing"
)

func TestSnap(t *testing.T) {
	tests := []struct {
		lat, lng   float64
		wLat, wLng float64
	}{
		{25.2048, 55.2708, 25.5, 55.5},
		{51.5072, -0.1276, 52.5, -1.5},
		{-6.2088, 106.8456, -7.5, 106.5},
		{90, 0, 88.5, 1.5},
		{0, 180, 1.5, -178.5},
		{-90, -180, -88.5, -178.5},
		{10, 540, 10.5, -178.5},
		{10, -181, 10.5, 178.5},
	}
	for _, tt := range tests {
		gLat, gLng := Snap(tt.lat, tt.lng, 3)
		if gLat != tt.wLat || gLng != tt.wLng {
			t.Errorf("Snap(%v, %v) = (%v, %v), want (%v, %v)", tt.lat, tt.lng, gLat, gLng, tt.wLat, tt.wLng)
		}
	}
}

func TestSnapNeverPassesRawValueThrough(t *testing.T) {
	rng := rand.New(rand.NewPCG(1, 2))
	for i := 0; i < 1000; i++ {
		lat := rng.Float64()*180 - 90
		lng := rng.Float64()*360 - 180
		gLat, gLng := Snap(lat, lng, 3)
		if gLat == lat || gLng == lng {
			t.Fatalf("Snap(%v, %v) = (%v, %v) passes a raw value through", lat, lng, gLat, gLng)
		}
		if gLat < -90 || gLat > 90 || gLng < -180 || gLng >= 180 {
			t.Fatalf("Snap(%v, %v) = (%v, %v) out of range", lat, lng, gLat, gLng)
		}
	}
}

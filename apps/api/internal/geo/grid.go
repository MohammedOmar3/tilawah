// Package geo turns coarse location hints into privacy-safe grid cells.
package geo

import "math"

// Snap returns the centre of the deg×deg grid cell containing (lat, lng).
// Latitude is clamped to [-90, 90) and longitude wrapped into [-180, 180),
// so the result is always a cell centre and never the raw input.
func Snap(lat, lng, deg float64) (cLat, cLng float64) {
	const eps = 1e-9
	lat = math.Max(-90, math.Min(lat, 90-eps))
	lng = math.Mod(lng+180, 360)
	if lng < 0 {
		lng += 360
	}
	lng -= 180
	return centre(lat, deg), centre(lng, deg)
}

func centre(x, deg float64) float64 {
	return math.Floor(x/deg)*deg + deg/2
}

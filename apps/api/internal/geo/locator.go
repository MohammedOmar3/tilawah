package geo

import (
	"math"
	"net/http"
	"strconv"
	"strings"
)

// Cell is a privacy-safe location: a country and a grid cell centre (or a
// snapped country centroid). It never holds raw coordinates.
type Cell struct {
	Country string
	Lat     float64
	Lng     float64
}

// Locate derives a Cell from Cloudflare's visitor-location headers. It returns
// false when trust is off, the country is unknown (XX) or Tor (T1), or no
// location can be derived. Raw header values never leave this function: they
// are snapped to the deg grid immediately.
func Locate(h http.Header, trust bool, deg float64) (Cell, bool) {
	if !trust {
		return Cell{}, false
	}
	country := strings.ToUpper(strings.TrimSpace(h.Get("cf-ipcountry")))
	if len(country) != 2 || country == "XX" || country == "T1" {
		return Cell{}, false
	}
	if lat, lng, ok := parseLatLng(h.Get("cf-iplatitude"), h.Get("cf-iplongitude")); ok {
		cLat, cLng := Snap(lat, lng, deg)
		return Cell{Country: country, Lat: cLat, Lng: cLng}, true
	}
	lat, lng, ok := Centroid(country)
	if !ok {
		return Cell{}, false
	}
	cLat, cLng := Snap(lat, lng, deg)
	return Cell{Country: country, Lat: cLat, Lng: cLng}, true
}

func parseLatLng(latS, lngS string) (lat, lng float64, ok bool) {
	lat, err1 := strconv.ParseFloat(strings.TrimSpace(latS), 64)
	lng, err2 := strconv.ParseFloat(strings.TrimSpace(lngS), 64)
	if err1 != nil || err2 != nil ||
		math.IsNaN(lat) || math.IsNaN(lng) ||
		lat < -90 || lat > 90 || lng < -180 || lng > 180 {
		return 0, 0, false
	}
	return lat, lng, true
}

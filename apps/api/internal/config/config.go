// Package config loads service configuration from the environment (spec §6).
package config

import (
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"
)

// Config is the full service configuration.
type Config struct {
	Port             string
	AllowedOrigins   []string
	OriginSecret     string
	ProgrammeVersion string
	SnapshotInterval time.Duration
	GridDeg          float64
	KMin             int
	MaxConns         int
	MaxConnsPerIP    int
	StatsToken       string
	TrustCFHeaders   bool
	LogLevel         string
}

// Load reads configuration through lookup (os.LookupEnv in main).
func Load(lookup func(string) (string, bool)) (Config, error) {
	get := func(key, def string) string {
		if v, ok := lookup(key); ok && strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
		return def
	}
	positiveInt := func(key, def string) (int, error) {
		raw := get(key, def)
		n, err := strconv.Atoi(raw)
		if err != nil || n <= 0 {
			return 0, fmt.Errorf("%s must be a positive integer, got %q", key, raw)
		}
		return n, nil
	}

	c := Config{
		Port:             get("PORT", "8080"),
		OriginSecret:     get("ORIGIN_SECRET", ""),
		ProgrammeVersion: get("PROGRAMME_VERSION", "dev"),
		StatsToken:       get("STATS_TOKEN", ""),
		LogLevel:         get("LOG_LEVEL", "info"),
	}

	for _, o := range strings.Split(get("ALLOWED_ORIGINS", "http://localhost:3000"), ",") {
		if o = strings.TrimSpace(o); o != "" {
			c.AllowedOrigins = append(c.AllowedOrigins, o)
		}
	}
	if len(c.AllowedOrigins) == 0 {
		return Config{}, fmt.Errorf("ALLOWED_ORIGINS must list at least one origin")
	}

	raw := get("SNAPSHOT_INTERVAL", "10s")
	d, err := time.ParseDuration(raw)
	if err != nil || d <= 0 {
		return Config{}, fmt.Errorf("SNAPSHOT_INTERVAL must be a positive duration, got %q", raw)
	}
	c.SnapshotInterval = d

	raw = get("GRID_DEG", "3")
	g, err := strconv.ParseFloat(raw, 64)
	if err != nil || g <= 0 || g > 180 || math.Mod(180, g) != 0 {
		return Config{}, fmt.Errorf("GRID_DEG must be a positive number dividing 180 evenly, got %q", raw)
	}
	c.GridDeg = g

	if c.KMin, err = positiveInt("K_MIN", "5"); err != nil {
		return Config{}, err
	}
	if c.MaxConns, err = positiveInt("MAX_CONNS", "20000"); err != nil {
		return Config{}, err
	}
	if c.MaxConnsPerIP, err = positiveInt("MAX_CONNS_PER_IP", "5"); err != nil {
		return Config{}, err
	}

	raw = get("TRUST_CF_HEADERS", "false")
	b, err := strconv.ParseBool(raw)
	if err != nil {
		return Config{}, fmt.Errorf("TRUST_CF_HEADERS must be true or false, got %q", raw)
	}
	c.TrustCFHeaders = b

	return c, nil
}

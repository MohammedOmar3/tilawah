package config

import (
	"reflect"
	"strings"
	"testing"
	"time"
)

func lookupFrom(env map[string]string) func(string) (string, bool) {
	return func(k string) (string, bool) {
		v, ok := env[k]
		return v, ok
	}
}

func TestLoad(t *testing.T) {
	defaults := Config{
		Port:             "8080",
		AllowedOrigins:   []string{"http://localhost:3000"},
		OriginSecret:     "",
		ProgrammeVersion: "dev",
		SnapshotInterval: 10 * time.Second,
		GridDeg:          3,
		KMin:             5,
		MaxConns:         20000,
		MaxConnsPerIP:    5,
		StatsToken:       "",
		TrustCFHeaders:   false,
		LogLevel:         "info",
	}

	withOrigins := defaults
	withOrigins.AllowedOrigins = []string{"https://a.com", "https://b.com"}

	custom := defaults
	custom.Port = "9000"
	custom.OriginSecret = "s3cret"
	custom.ProgrammeVersion = "2026-09-27.1"
	custom.SnapshotInterval = 15 * time.Second
	custom.GridDeg = 5
	custom.KMin = 3
	custom.MaxConns = 100
	custom.MaxConnsPerIP = 2
	custom.StatsToken = "tok"
	custom.TrustCFHeaders = true
	custom.LogLevel = "debug"

	tests := []struct {
		name    string
		env     map[string]string
		want    Config
		wantErr string
	}{
		{name: "empty env gives defaults", env: map[string]string{}, want: defaults},
		{name: "origins are split and trimmed", env: map[string]string{"ALLOWED_ORIGINS": "https://a.com, https://b.com"}, want: withOrigins},
		{name: "all overridden", env: map[string]string{
			"PORT": "9000", "ORIGIN_SECRET": "s3cret", "PROGRAMME_VERSION": "2026-09-27.1",
			"SNAPSHOT_INTERVAL": "15s", "GRID_DEG": "5", "K_MIN": "3", "MAX_CONNS": "100",
			"MAX_CONNS_PER_IP": "2", "STATS_TOKEN": "tok", "TRUST_CF_HEADERS": "true", "LOG_LEVEL": "debug",
		}, want: custom},
		{name: "grid deg zero", env: map[string]string{"GRID_DEG": "0"}, wantErr: "GRID_DEG"},
		{name: "grid deg not dividing 180", env: map[string]string{"GRID_DEG": "7"}, wantErr: "GRID_DEG"},
		{name: "k min zero", env: map[string]string{"K_MIN": "0"}, wantErr: "K_MIN"},
		{name: "bad interval", env: map[string]string{"SNAPSHOT_INTERVAL": "abc"}, wantErr: "SNAPSHOT_INTERVAL"},
		{name: "bad max conns", env: map[string]string{"MAX_CONNS": "-1"}, wantErr: "MAX_CONNS"},
		{name: "bad trust flag", env: map[string]string{"TRUST_CF_HEADERS": "maybe"}, wantErr: "TRUST_CF_HEADERS"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Load(lookupFrom(tt.env))
			if tt.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("err = %v, want error naming %s", err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("got %+v\nwant %+v", got, tt.want)
			}
		})
	}
}

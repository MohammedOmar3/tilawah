// Command gencentroids regenerates internal/geo/centroids.csv from Natural Earth
// 1:50m admin-0 countries (label points). Run from apps/api:
//
//	go run ./internal/geo/internal/gencentroids
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"
)

const defaultURL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson"

type featureCollection struct {
	Features []struct {
		Properties struct {
			ISOA2   string  `json:"ISO_A2"`
			ISOA2EH string  `json:"ISO_A2_EH"`
			LabelX  float64 `json:"LABEL_X"`
			LabelY  float64 `json:"LABEL_Y"`
		} `json:"properties"`
	} `json:"features"`
}

func main() {
	url := flag.String("url", defaultURL, "Natural Earth admin-0 GeoJSON URL")
	out := flag.String("out", "internal/geo/centroids.csv", "output CSV path")
	flag.Parse()
	if err := run(*url, *out); err != nil {
		log.Fatal(err)
	}
}

func run(url, out string) error {
	client := &http.Client{Timeout: 2 * time.Minute}
	resp, err := client.Get(url)
	if err != nil {
		return fmt.Errorf("download: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download: status %s", resp.Status)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read body: %w", err)
	}
	var fc featureCollection
	if err := json.Unmarshal(body, &fc); err != nil {
		return fmt.Errorf("decode geojson: %w", err)
	}

	rows := map[string]string{}
	for _, f := range fc.Features {
		p := f.Properties
		iso := strings.ToUpper(strings.TrimSpace(p.ISOA2))
		if iso == "-99" || iso == "" {
			iso = strings.ToUpper(strings.TrimSpace(p.ISOA2EH))
		}
		if iso == "-99" || len(iso) != 2 {
			continue
		}
		if _, dup := rows[iso]; dup {
			continue
		}
		rows[iso] = fmt.Sprintf("%s,%s,%s", iso, round1(p.LabelY), round1(p.LabelX))
	}
	keys := make([]string, 0, len(rows))
	for k := range rows {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var b strings.Builder
	b.WriteString("iso2,lat,lng\n")
	for _, k := range keys {
		b.WriteString(rows[k])
		b.WriteByte('\n')
	}
	if err := os.WriteFile(out, []byte(b.String()), 0o644); err != nil {
		return fmt.Errorf("write %s: %w", out, err)
	}
	log.Printf("wrote %d centroids to %s", len(keys), out)
	return nil
}

func round1(x float64) string {
	r := math.Round(x*10) / 10
	if r == 0 {
		r = 0 // avoid "-0"
	}
	return fmt.Sprintf("%.1f", r)
}

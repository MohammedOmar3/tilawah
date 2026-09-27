// Command loadtest opens N WebSocket clients that speak protocol v1 like the
// browser (hello, 8-ping join burst, state, heartbeats, stats, 3-ping
// re-syncs), measures pong latency and the bytes each client receives, and
// projects Railway egress for 5,000 always-on listeners (spec S7, S8).
//
//	go run . -url ws://localhost:8080/v1/ws -n 5000 -ramp 60s -duration 10m \
//	  -origin http://localhost:3000 -stats-token local
package main

import (
	"bufio"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"math/rand/v2"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

// countryCentres are rough population centres used to fake cf-iplatitude and
// cf-iplongitude. Countries not listed get cf-ipcountry only, and the server
// falls back to its centroid table.
var countryCentres = map[string][2]float64{
	"AE": {24.5, 54.5}, "BD": {23.7, 90.4}, "DE": {51.2, 10.4}, "DZ": {36.7, 3.1},
	"EG": {30.0, 31.2}, "FR": {48.9, 2.4}, "GB": {52.5, -1.5}, "ID": {-6.2, 106.8},
	"IN": {22.0, 79.0}, "IR": {35.7, 51.4}, "IQ": {33.3, 44.4}, "MA": {33.6, -7.6},
	"MY": {3.1, 101.7}, "NG": {9.1, 7.5}, "PK": {30.4, 69.3}, "SA": {24.7, 46.7},
	"TR": {39.9, 32.9}, "US": {39.8, -98.6}, "CA": {45.4, -75.7}, "ZA": {-26.2, 28.0},
}

type options struct {
	url, origin, secret, programme string
	n                              int
	ramp, duration                 time.Duration
	anonRatio                      float64
	countries                      []string
	schedule                       Schedule
	statsToken                     string
	serverPID                      int
	assumptions                    Assumptions
}

func main() {
	o, err := parseFlags(os.Args[1:])
	if err != nil {
		fmt.Fprintln(os.Stderr, "loadtest:", err)
		os.Exit(2)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	run(ctx, o, os.Stdout)
}

func parseFlags(args []string) (options, error) {
	var o options
	a := DefaultAssumptions()
	fs := flag.NewFlagSet("loadtest", flag.ContinueOnError)
	fs.StringVar(&o.url, "url", "ws://localhost:8080/v1/ws", "WebSocket URL")
	fs.IntVar(&o.n, "n", 100, "number of clients")
	fs.DurationVar(&o.ramp, "ramp", 10*time.Second, "spread connects evenly over this long")
	fs.DurationVar(&o.duration, "duration", time.Minute, "total run time, ramp included")
	fs.StringVar(&o.origin, "origin", "http://localhost:3000", "Origin header")
	fs.StringVar(&o.secret, "secret", "", "X-Origin-Auth header (ORIGIN_SECRET)")
	fs.StringVar(&o.programme, "programme", "dev", "programme version sent in hello")
	fs.Float64Var(&o.anonRatio, "anon-ratio", 0.2, "fraction of clients that join anonymously")
	country := fs.String("country", "", "comma list of ISO codes to fake cf-ipcountry/cf-iplatitude/cf-iplongitude (needs TRUST_CF_HEADERS=true)")
	fs.DurationVar(&o.schedule.Heartbeat, "hb", 45*time.Second, "heartbeat interval")
	fs.DurationVar(&o.schedule.Resync, "resync", 5*time.Minute, "3-ping re-sync interval")
	fs.DurationVar(&o.schedule.Stat, "stat", 60*time.Second, "stat interval")
	fs.DurationVar(&o.schedule.PingSpacing, "ping-spacing", 100*time.Millisecond, "gap between pings in a burst")
	fs.DurationVar(&o.schedule.BurstTimeout, "burst-timeout", 3*time.Second, "wait this long for a burst's pongs")
	fs.StringVar(&o.statsToken, "stats-token", "", "STATS_TOKEN; when set, /v1/stats and /v1/presence.json are polled during the run")
	fs.IntVar(&o.serverPID, "server-pid", 0, "local API process id; when set, its RSS is read from /proc")
	fs.IntVar(&a.Listeners, "project-listeners", a.Listeners, "listeners to project egress for")
	fs.Float64Var(&a.PricePerGB, "price-per-gb", a.PricePerGB, "egress price in USD per GB")
	fs.DurationVar(&a.Session, "session", a.Session, "average listening session, for amortising the join cost")
	if err := fs.Parse(args); err != nil {
		return o, err
	}
	switch {
	case o.n <= 0:
		return o, fmt.Errorf("-n must be positive")
	case o.ramp < 0 || o.duration <= o.ramp:
		return o, fmt.Errorf("-duration must be longer than -ramp")
	case o.anonRatio < 0 || o.anonRatio > 1:
		return o, fmt.Errorf("-anon-ratio must be between 0 and 1")
	case o.schedule.Heartbeat <= 0 || o.schedule.Resync <= 0 || o.schedule.Stat <= 0 || o.schedule.PingSpacing <= 0 || o.schedule.BurstTimeout <= 0:
		return o, fmt.Errorf("schedule durations must be positive")
	}
	for _, c := range strings.Split(*country, ",") {
		if c = strings.ToUpper(strings.TrimSpace(c)); c != "" {
			o.countries = append(o.countries, c)
		}
	}
	a.TLSMeasured = strings.HasPrefix(o.url, "wss://")
	o.assumptions = a
	return o, nil
}

func run(ctx context.Context, o options, out io.Writer) {
	ctx, cancel := context.WithTimeout(ctx, o.duration)
	defer cancel()
	start := time.Now()

	live := &LiveCounts{}
	results := make([]Result, o.n)
	var wg sync.WaitGroup

	obs := &serverObs{}
	var pollWG sync.WaitGroup
	if o.statsToken != "" || o.serverPID > 0 {
		pollWG.Add(1)
		go func() { defer pollWG.Done(); obs.poll(ctx, o) }()
	}

	progressDone := make(chan struct{})
	go func() {
		defer close(progressDone)
		t := time.NewTicker(10 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				fmt.Fprintf(out, "t=%-4s joined=%d failed=%d dropped=%d %s\n",
					time.Since(start).Round(time.Second), live.Joined.Load(), live.Failed.Load(), live.Dropped.Load(), obs.brief())
			}
		}
	}()

	rng := rand.New(rand.NewPCG(1, 2))
launch:
	for i := 0; i < o.n; i++ {
		if o.n > 1 {
			at := start.Add(time.Duration(int64(o.ramp) * int64(i) / int64(o.n)))
			select {
			case <-time.After(time.Until(at)):
			case <-ctx.Done():
				break launch
			}
		}
		cfg := ClientConfig{
			URL: o.url, Origin: o.origin, Secret: o.secret, Programme: o.programme,
			Anon:     rng.Float64() < o.anonRatio,
			Header:   fakeLocation(o.countries, rng),
			Schedule: o.schedule,
			Seed:     uint64(i) + 1,
			Live:     live,
		}
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			results[i] = RunClient(ctx, cfg)
		}(i)
	}
	<-ctx.Done()
	fmt.Fprintf(out, "closing clients...\n")
	wg.Wait()
	pollWG.Wait()
	<-progressDone

	a := o.assumptions
	a.MeasuredSnapshotBytes = obs.presenceGzip
	s := Summarize(results, a)
	fmt.Fprintf(out, "\nrun: %d clients, ramp %s, duration %s, hb %s, resync %s, stat %s, anon %.0f%%, url %s\n\n",
		o.n, o.ramp, o.duration, o.schedule.Heartbeat, o.schedule.Resync, o.schedule.Stat, o.anonRatio*100, o.url)
	s.Write(out, a)
	obs.write(out)
	errs := map[string]int{}
	for _, r := range results {
		if r.Err != nil {
			errs[r.Err.Error()]++
		}
	}
	for e, n := range errs {
		fmt.Fprintf(out, "error x%d: %s\n", n, e)
	}
}

func fakeLocation(countries []string, rng *rand.Rand) http.Header {
	if len(countries) == 0 {
		return nil
	}
	c := countries[rng.IntN(len(countries))]
	h := http.Header{"Cf-Ipcountry": {c}}
	if ll, ok := countryCentres[c]; ok {
		lat := ll[0] + (rng.Float64()*2-1)*4
		lng := ll[1] + (rng.Float64()*2-1)*4
		h.Set("Cf-Iplatitude", strconv.FormatFloat(lat, 'f', 4, 64))
		h.Set("Cf-Iplongitude", strconv.FormatFloat(lng, 'f', 4, 64))
	}
	return h
}

// serverObs holds peaks read from the API while the run is going.
type serverObs struct {
	mu                                 sync.Mutex
	polls                              int
	connections, listeners, goroutines int
	sysBytes, heapInuse                uint64
	rssKB, hwmKB                       int64
	presenceGzip, presenceListeners    int
	presenceCells                      int
	lastErr                            string
}

func (s *serverObs) poll(ctx context.Context, o options) {
	base, err := httpBase(o.url)
	if err != nil {
		s.lastErr = err.Error()
		return
	}
	hc := &http.Client{Timeout: 5 * time.Second}
	t := time.NewTicker(5 * time.Second)
	defer t.Stop()
	for {
		s.pollOnce(hc, base, o)
		select {
		case <-ctx.Done():
			s.pollOnce(hc, base, o)
			return
		case <-t.C:
		}
	}
}

func (s *serverObs) pollOnce(hc *http.Client, base string, o options) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.polls++
	if o.serverPID > 0 {
		if rss, hwm, err := procRSS(o.serverPID); err == nil {
			s.rssKB = max(s.rssKB, rss)
			s.hwmKB = max(s.hwmKB, hwm)
		}
	}
	if o.statsToken == "" {
		return
	}
	req, _ := http.NewRequest(http.MethodGet, base+"/v1/stats", nil)
	req.Header.Set("Authorization", "Bearer "+o.statsToken)
	if o.secret != "" {
		req.Header.Set("X-Origin-Auth", o.secret)
	}
	var st struct {
		Connections int `json:"connections"`
		Listeners   int `json:"listeners"`
		Memory      struct {
			HeapInuseBytes uint64 `json:"heapInuseBytes"`
			SysBytes       uint64 `json:"sysBytes"`
			Goroutines     int    `json:"goroutines"`
		} `json:"memory"`
	}
	if resp, err := hc.Do(req); err != nil {
		s.lastErr = err.Error()
	} else {
		err = json.NewDecoder(resp.Body).Decode(&st)
		_ = resp.Body.Close()
		if err == nil {
			s.connections = max(s.connections, st.Connections)
			s.listeners = max(s.listeners, st.Listeners)
			s.goroutines = max(s.goroutines, st.Memory.Goroutines)
			s.sysBytes = max(s.sysBytes, st.Memory.SysBytes)
			s.heapInuse = max(s.heapInuse, st.Memory.HeapInuseBytes)
		}
	}

	// Setting Accept-Encoding ourselves keeps the body compressed, so its
	// length is what Cloudflare fetches from the origin.
	req, _ = http.NewRequest(http.MethodGet, base+"/v1/presence.json", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	if o.secret != "" {
		req.Header.Set("X-Origin-Auth", o.secret)
	}
	if resp, err := hc.Do(req); err == nil {
		body, _ := io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		if resp.StatusCode == http.StatusOK && len(body) > s.presenceGzip {
			s.presenceGzip = len(body)
		}
	}
	req, _ = http.NewRequest(http.MethodGet, base+"/v1/presence.json", nil)
	if o.secret != "" {
		req.Header.Set("X-Origin-Auth", o.secret)
	}
	if resp, err := hc.Do(req); err == nil {
		var p struct {
			Listeners int               `json:"listeners"`
			Cells     []json.RawMessage `json:"cells"`
		}
		if json.NewDecoder(resp.Body).Decode(&p) == nil {
			s.presenceListeners = max(s.presenceListeners, p.Listeners)
			s.presenceCells = max(s.presenceCells, len(p.Cells))
		}
		_ = resp.Body.Close()
	}
}

func (s *serverObs) brief() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.polls == 0 {
		return ""
	}
	return fmt.Sprintf("| server peak: conns=%d listeners=%d sys=%.1fMB rss=%.1fMB", s.connections, s.listeners,
		float64(s.sysBytes)/1e6, float64(s.rssKB)/1024)
}

func (s *serverObs) write(w io.Writer) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.polls == 0 {
		return
	}
	fmt.Fprintf(w, "\nserver (peaks over %d polls):\n", s.polls)
	if s.rssKB > 0 {
		fmt.Fprintf(w, "  RSS %.1f MiB (VmHWM %.1f MiB)\n", float64(s.rssKB)/1024, float64(s.hwmKB)/1024)
	}
	if s.sysBytes > 0 {
		fmt.Fprintf(w, "  /v1/stats: connections %d, listeners %d, goroutines %d, Go sys %.1f MiB, heap in use %.1f MiB\n",
			s.connections, s.listeners, s.goroutines, float64(s.sysBytes)/(1<<20), float64(s.heapInuse)/(1<<20))
	}
	if s.presenceGzip > 0 {
		fmt.Fprintf(w, "  presence.json: %d B gzip, listeners %d, cells %d\n", s.presenceGzip, s.presenceListeners, s.presenceCells)
	}
	if s.lastErr != "" {
		fmt.Fprintf(w, "  last poll error: %s\n", s.lastErr)
	}
}

// httpBase turns ws(s)://host/v1/ws into http(s)://host.
func httpBase(wsURL string) (string, error) {
	u, err := url.Parse(wsURL)
	if err != nil {
		return "", fmt.Errorf("parse -url: %w", err)
	}
	switch u.Scheme {
	case "ws":
		u.Scheme = "http"
	case "wss":
		u.Scheme = "https"
	default:
		return "", fmt.Errorf("-url must be ws:// or wss://, got %q", wsURL)
	}
	return u.Scheme + "://" + u.Host, nil
}

// procRSS reads VmRSS and VmHWM (kB) for a local process.
func procRSS(pid int) (rss, hwm int64, err error) {
	f, err := os.Open(fmt.Sprintf("/proc/%d/status", pid))
	if err != nil {
		return 0, 0, fmt.Errorf("open status: %w", err)
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		fields := strings.Fields(sc.Text())
		if len(fields) < 2 {
			continue
		}
		v, _ := strconv.ParseInt(fields[1], 10, 64)
		switch fields[0] {
		case "VmRSS:":
			rss = v
		case "VmHWM:":
			hwm = v
		}
	}
	return rss, hwm, sc.Err()
}

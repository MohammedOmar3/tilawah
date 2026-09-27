package presence

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"sync/atomic"
	"time"

	"github.com/MohammedOmar3/tilawah/apps/api/internal/clock"
)

// Payload is a pre-built presence.json, plain and gzipped.
type Payload struct {
	Plain []byte
	Gzip  []byte
}

type document struct {
	V           int    `json:"v"`
	GeneratedAt string `json:"generatedAt"`
	Listeners   int    `json:"listeners"`
	Countries   int    `json:"countries"`
	Cells       []Cell `json:"cells"`
	Joins       []Cell `json:"joins"`
}

// Publisher periodically rebuilds presence.json so HTTP requests only copy bytes.
type Publisher struct {
	reg    *Registry
	clk    clock.Clock
	latest atomic.Pointer[Payload]
}

// NewPublisher returns a publisher whose Latest is a valid empty snapshot until the first Build.
func NewPublisher(reg *Registry, clk clock.Clock) *Publisher {
	p := &Publisher{reg: reg, clk: clk}
	empty, err := encode(document{V: 1, GeneratedAt: formatTime(clk.Now()), Cells: []Cell{}, Joins: []Cell{}})
	if err != nil {
		panic(fmt.Sprintf("presence: encode empty snapshot: %v", err)) // static data; cannot fail
	}
	p.latest.Store(empty)
	return p
}

// Latest returns the most recently built payload. It is never nil.
func (p *Publisher) Latest() *Payload { return p.latest.Load() }

// Build takes a registry snapshot and stores its encoded bytes.
func (p *Publisher) Build(now time.Time) {
	s := p.reg.Snapshot()
	pl, err := encode(document{
		V:           1,
		GeneratedAt: formatTime(now),
		Listeners:   s.Listeners,
		Countries:   s.Countries,
		Cells:       nonNil(s.Cells),
		Joins:       nonNil(s.Joins),
	})
	if err != nil {
		return // encoding plain structs of numbers cannot fail; keep the previous payload
	}
	p.latest.Store(pl)
}

// Run builds immediately and then every interval until ctx is done.
func (p *Publisher) Run(ctx context.Context, interval time.Duration) {
	p.Build(p.clk.Now())
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			p.Build(p.clk.Now())
		}
	}
}

func encode(d document) (*Payload, error) {
	plain, err := json.Marshal(d)
	if err != nil {
		return nil, fmt.Errorf("marshal presence: %w", err)
	}
	var buf bytes.Buffer
	zw, err := gzip.NewWriterLevel(&buf, gzip.BestCompression)
	if err != nil {
		return nil, fmt.Errorf("gzip writer: %w", err)
	}
	if _, err := zw.Write(plain); err != nil {
		return nil, fmt.Errorf("gzip write: %w", err)
	}
	if err := zw.Close(); err != nil {
		return nil, fmt.Errorf("gzip close: %w", err)
	}
	return &Payload{Plain: plain, Gzip: buf.Bytes()}, nil
}

func formatTime(t time.Time) string { return t.UTC().Format(time.RFC3339) }

func nonNil(cs []Cell) []Cell {
	if cs == nil {
		return []Cell{}
	}
	return cs
}

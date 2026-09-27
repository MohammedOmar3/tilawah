// Package limits caps connections globally and per client IP. IPs are only
// ever held as salted hashes; the salt lives in memory and rotates daily.
package limits

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"sync"
	"time"

	"github.com/MohammedOmar3/tilawah/apps/api/internal/clock"
)

// Limiter enforces MAX_CONNS and MAX_CONNS_PER_IP. It is safe for concurrent use.
type Limiter struct {
	maxConns, perIP int
	clk             clock.Clock

	mu      sync.Mutex
	salt    [16]byte
	saltDay string
	counts  map[string]int
	total   int
}

// New returns a limiter allowing maxConns connections in total and perIP per client.
func New(maxConns, perIP int, clk clock.Clock) *Limiter {
	return &Limiter{maxConns: maxConns, perIP: perIP, clk: clk, counts: make(map[string]int)}
}

// Acquire reserves a slot for ip. On success it returns the hashed key that
// must be passed to Release. The raw ip is not retained.
func (l *Limiter) Acquire(ip string) (key string, ok bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.rotateLocked()
	sum := sha256.Sum256(append(l.salt[:len(l.salt):len(l.salt)], ip...))
	key = hex.EncodeToString(sum[:])[:16]
	if l.total >= l.maxConns || l.counts[key] >= l.perIP {
		return "", false
	}
	l.counts[key]++
	l.total++
	return key, true
}

// Release frees a slot previously returned by Acquire. Unknown keys are ignored.
func (l *Limiter) Release(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	n, ok := l.counts[key]
	if !ok {
		return
	}
	if n <= 1 {
		delete(l.counts, key)
	} else {
		l.counts[key] = n - 1
	}
	l.total--
}

// Total returns the number of held slots.
func (l *Limiter) Total() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.total
}

func (l *Limiter) rotateLocked() {
	day := l.clk.Now().UTC().Format(time.DateOnly)
	if day == l.saltDay {
		return
	}
	if _, err := rand.Read(l.salt[:]); err != nil {
		panic("limits: crypto/rand failed: " + err.Error()) // never happens on supported platforms
	}
	l.saltDay = day
}

// keys lists the stored keys (test helper for the no-raw-IP check).
func (l *Limiter) keys() []string {
	l.mu.Lock()
	defer l.mu.Unlock()
	out := make([]string, 0, len(l.counts))
	for k := range l.counts {
		out = append(out, k)
	}
	return out
}

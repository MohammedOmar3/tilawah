package ws

import (
	"sync"

	"github.com/coder/websocket"
)

// Hub tracks live sockets so shutdown can close them with 1012 (service
// restart), which tells clients to reconnect with jitter.
type Hub struct {
	mu     sync.Mutex
	conns  map[*websocket.Conn]struct{}
	closed bool
	code   websocket.StatusCode
	reason string
}

// NewHub returns an empty hub.
func NewHub() *Hub {
	return &Hub{conns: make(map[*websocket.Conn]struct{})}
}

// Register adds c. It returns false (and closes c) once CloseAll has run.
// The returned func unregisters c.
func (h *Hub) Register(c *websocket.Conn) (unregister func(), ok bool) {
	h.mu.Lock()
	if h.closed {
		code, reason := h.code, h.reason
		h.mu.Unlock()
		_ = c.Close(code, reason)
		return func() {}, false
	}
	h.conns[c] = struct{}{}
	h.mu.Unlock()
	return func() {
		h.mu.Lock()
		delete(h.conns, c)
		h.mu.Unlock()
	}, true
}

// Len returns the number of registered sockets.
func (h *Hub) Len() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.conns)
}

// CloseAll closes every registered socket with code and reason, and turns
// away sockets registered afterwards. It returns when all close handshakes
// have finished or timed out.
func (h *Hub) CloseAll(code websocket.StatusCode, reason string) {
	h.mu.Lock()
	h.closed, h.code, h.reason = true, code, reason
	conns := make([]*websocket.Conn, 0, len(h.conns))
	for c := range h.conns {
		conns = append(conns, c)
	}
	h.mu.Unlock()

	var wg sync.WaitGroup
	for _, c := range conns {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = c.Close(code, reason)
		}()
	}
	wg.Wait()
}

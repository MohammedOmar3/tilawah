package ws

import (
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"time"

	"github.com/coder/websocket"

	"github.com/MohammedOmar3/tilawah/apps/api/internal/clock"
	"github.com/MohammedOmar3/tilawah/apps/api/internal/config"
	"github.com/MohammedOmar3/tilawah/apps/api/internal/geo"
	"github.com/MohammedOmar3/tilawah/apps/api/internal/limits"
	"github.com/MohammedOmar3/tilawah/apps/api/internal/presence"
	"github.com/MohammedOmar3/tilawah/apps/api/internal/telemetry"
)

const (
	defaultHelloTimeout = 5 * time.Second
	defaultIdleTimeout  = 120 * time.Second
	readLimitBytes      = 1024
	writeTimeout        = 5 * time.Second
	rateMaxMessages     = 20
	rateWindow          = 10 * time.Second
)

// Handler serves /v1/ws.
type Handler struct {
	Cfg       config.Config
	Clock     clock.Clock
	Registry  *presence.Registry
	Telemetry *telemetry.Recorder
	Limiter   *limits.Limiter
	// Locate turns request headers into a snapped cell. It is called at most
	// once per connection, at hello, and never for anonymous listeners.
	Locate func(http.Header) (geo.Cell, bool)
	Log    *slog.Logger

	// HelloTimeout and IdleTimeout default to 5 s and 120 s when zero.
	HelloTimeout time.Duration
	IdleTimeout  time.Duration
}

// ServeHTTP upgrades the request and runs the session until it ends.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	key, ok := h.Limiter.Acquire(h.clientIP(r))
	if !ok {
		http.Error(w, "too many connections", http.StatusServiceUnavailable)
		return
	}
	defer h.Limiter.Release(key)

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns:  h.originPatterns(),
		CompressionMode: websocket.CompressionDisabled,
	})
	if err != nil {
		// Accept has already written the error response. The error text can
		// contain the Origin header, so it is not logged.
		h.Log.Debug("ws handshake rejected")
		return
	}
	conn.SetReadLimit(readLimitBytes)

	s := newSession(h, conn, r.Header)
	h.Log.Debug("ws open", "connections", h.Registry.Connections()+1)
	s.run(r.Context())
	h.Log.Debug("ws close", "connections", h.Registry.Connections())
}

// clientIP is used only for the hashed per-IP cap; it is never logged or stored.
func (h *Handler) clientIP(r *http.Request) string {
	if h.Cfg.TrustCFHeaders {
		if ip := r.Header.Get("CF-Connecting-IP"); ip != "" {
			return ip
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// originPatterns turns ALLOWED_ORIGINS into scheme://host patterns.
func (h *Handler) originPatterns() []string {
	out := make([]string, 0, len(h.Cfg.AllowedOrigins))
	for _, o := range h.Cfg.AllowedOrigins {
		if u, err := url.Parse(o); err == nil && u.Scheme != "" && u.Host != "" {
			out = append(out, u.Scheme+"://"+u.Host)
		} else {
			out = append(out, o)
		}
	}
	return out
}

func (h *Handler) helloTimeout() time.Duration {
	if h.HelloTimeout > 0 {
		return h.HelloTimeout
	}
	return defaultHelloTimeout
}

func (h *Handler) idleTimeout() time.Duration {
	if h.IdleTimeout > 0 {
		return h.IdleTimeout
	}
	return defaultIdleTimeout
}

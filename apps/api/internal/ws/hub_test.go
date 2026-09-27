package ws

import (
	"testing"

	"github.com/coder/websocket"
)

func TestHubCloseAllSendsServiceRestart(t *testing.T) {
	f := newFixture(t, nil)
	var conns []*websocket.Conn
	for i := 0; i < 3; i++ {
		c := f.dial(t)
		send(t, c, hello(true, "dev"))
		recv(t, c)
		conns = append(conns, c)
	}
	waitFor(t, func() bool { return f.h.Hub.Len() == 3 })

	// CloseAll waits for each close handshake, so clients must be reading.
	done := make(chan struct{})
	go func() {
		f.h.Hub.CloseAll(websocket.StatusServiceRestart, "restart")
		close(done)
	}()
	for _, c := range conns {
		if code := expectClose(t, c); code != websocket.StatusServiceRestart {
			t.Fatalf("close code = %d, want 1012", code)
		}
	}
	<-done
	waitFor(t, func() bool { return f.h.Hub.Len() == 0 && f.reg.Connections() == 0 })

	// After CloseAll, new sessions are turned away with 1012 too.
	c := f.dial(t)
	if code := expectClose(t, c); code != websocket.StatusServiceRestart {
		t.Fatalf("late connection close code = %d, want 1012", code)
	}
}

func TestSessionsUnregisterOnDisconnect(t *testing.T) {
	f := newFixture(t, nil)
	c := f.dial(t)
	waitFor(t, func() bool { return f.h.Hub.Len() == 1 })
	_ = c.Close(websocket.StatusNormalClosure, "")
	waitFor(t, func() bool { return f.h.Hub.Len() == 0 })
}

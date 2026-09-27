// Package ws implements the WebSocket protocol v1 (spec §4.5): clock sync and
// presence reporting. The server replies only to hello and ping.
package ws

// ProtocolVersion is the only supported protocol version.
const ProtocolVersion = 1

type envelope struct {
	T string `json:"t"`
}

type helloMsg struct {
	V         int    `json:"v"`
	Anon      bool   `json:"anon"`
	Programme string `json:"programme"`
}

type pingMsg struct {
	ID int64   `json:"id"`
	C  float64 `json:"c"`
}

type stateMsg struct {
	Playing bool `json:"playing"`
}

type statMsg struct {
	RTTMs    float64 `json:"rttMs"`
	OffsetMs float64 `json:"offsetMs"`
	ErrMs    float64 `json:"errMs"`
}

type welcomeMsg struct {
	T         string  `json:"t"`
	V         int     `json:"v"`
	Programme string  `json:"programme"`
	S         float64 `json:"s"`
}

type pongMsg struct {
	T  string  `json:"t"`
	ID int64   `json:"id"`
	C  float64 `json:"c"`
	S  float64 `json:"s"`
}

type programmeMsg struct {
	T       string `json:"t"`
	Version string `json:"version"`
}

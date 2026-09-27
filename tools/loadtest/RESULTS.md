# Load test results

## 2026-09-27: local, 5,000 clients, 10 minutes

**Verdict: S7 and S8 pass locally.** Production confirmation is M-E7 (run the same command against `wss://tilawah-api.mxmd.dev/v1/ws` through Cloudflare).

| Check | Target | Result |
|---|---|---|
| S8 sockets held | 5,000 | 5,000 connected, 0 failed, 0 dropped for the whole run |
| S8 RSS | < 400 MB | **313 MiB** peak (VmRSS and VmHWM from `/proc`); Go `sys` 308 MiB, heap in use 241 MiB |
| S8 p99 pong latency | < 50 ms | **1.42 ms** (p50 0.29 ms, p95 0.51 ms, 55,000 pongs) |
| Bytes/client/min | – | **101.7 B** measured on the socket (join included); 21.6 B/min steady state |
| S7 egress, measured | ≤ $5/month (plan stop line) | **$1.42/month** ($1.10 socket + $0.32 presence snapshot) |
| S7 egress, conservative wire model | ≤ $5/month | **$4.74/month** |

### What ran

- Machine: 4 vCPU Intel Xeon 2.8 GHz, 16 GB RAM, Linux 6.18, Go 1.24.7. API and load tester on the same host over loopback (so pong latency is server processing plus scheduling, not network). `ulimit -n` was 20,000 (the hard limit), enough for 5,000 sockets per process.
- API, built from `apps/api` at this commit:
  ```
  STATS_TOKEN=local MAX_CONNS_PER_IP=100000 ALLOWED_ORIGINS=http://localhost:3000 \
  TRUST_CF_HEADERS=true LOG_LEVEL=warn ./server
  ```
  `TRUST_CF_HEADERS=true` so the faked `cf-*` headers place listeners on the grid and `presence.json` has a realistic number of cells. A 200-client, 30-second smoke run hit the same process a few minutes earlier.
- Load tester:
  ```
  go run . -url ws://localhost:8080/v1/ws -n 5000 -ramp 60s -duration 10m \
    -origin http://localhost:3000 -stats-token local -server-pid <api pid> \
    -country AE,GB,US,ID,PK,EG,SA,TR,MY,NG,IN,BD,DE,FR,MA,DZ,IQ,IR,CA,ZA
  ```
  Production schedule (hb 45 s, re-sync 5 min, stat 60 s, pings 100 ms apart), 20 % anonymous. Each client does exactly what the browser does: `hello`, `welcome`, an 8-ping burst, `state{playing:true}`, then heartbeats, stats and 3-ping re-syncs, and a normal close at the end.

### Memory

RSS climbed from 171 MiB at the end of the ramp to 236 MiB at 5 min and 313 MiB at 10 min with the socket count flat. That is GC headroom, not a leak: with the default `GOGC=100` the heap is allowed to reach about twice the live heap before a collection, and the run's live heap was around 150 MiB (≈ 30 KiB per socket: goroutine stack, read/write buffers, session and registry entries). After the clients left, the next forced GC brought the heap to 6.6 MiB. The peak should stay near 2 × live; if Railway's memory graph gets close to 400 MB in production, set `GOMEMLIMIT=320MiB` on the service to make the GC work harder instead of growing.

CPU: 33.5 s of CPU time for the whole run (ramp included), about 0.06 vCPU on average.

### Egress

Bytes are counted on the client's TCP connection, so they include the HTTP 101 response, WebSocket framing and every message, but not TCP/IP headers or TLS (the local run is plain `ws://`).

- Join (upgrade response, `welcome`, 8 pongs): 761 B once per connection.
- Steady state: 21.6 B/min (a 3-ping re-sync every 5 minutes; nothing else is sent to the client). 0.32 server messages/min out, 2.55 client messages/min in.
- Plan formula: `101.7 B/min × 60 × 24 × 30 × 5000 / 1e9 = 21.97 GB/month → $1.10` at $0.05/GB. This counts one join per 10-minute session.
- Presence snapshot: the measured gzip body at 5,000 listeners in 209 cells was 1,504 B; the estimate keeps the plan's 5 KB to allow for a real spread of cells. 5 KB × 5 Cloudflare tiers × one per 10 s × 30 days = 6.48 GB → **$0.32/month**.
- Conservative wire model (what Railway's meter could see on the wire to Cloudflare): add 52 B TCP/IP per server packet and per ACK of a client message, 22 B TLS record overhead per server message, and a 5 KB TLS handshake per connection, with the join amortised over 30-minute sessions. That gives 409 B/client/min → 88.4 GB/month → **$4.42**, **$4.74** with the snapshot.

Which message dominates: none of the protocol messages. In the wire model, 57 % is the per-connection cost (TLS handshake and join burst, 232 B/min at 30-minute sessions) and 32 % is TCP ACKs for the client's `hb`/`stat`/ping messages (133 B/min). Pongs themselves are about 6 %. Longer sessions or TLS session resumption between Cloudflare and Railway lower the first; fewer client messages (a longer heartbeat is not possible because of Cloudflare's 100 s idle timeout) would lower the second.

### Monthly cost at 5,000 always-on listeners (S7)

Railway prices assumed (check railway.com/pricing before relying on them): $0.05/GB egress, $10/GB-month RAM, $20/vCPU-month; Hobby plan $5/month including $5 of usage.

| Item | Estimate |
|---|---|
| Egress (measured → conservative) | $1.42 → $4.74 |
| RAM, 313 MiB always on | ≈ $3.10 |
| CPU, ≈ 0.06 vCPU | ≈ $1.20 |
| Usage total | ≈ $5.70 → $9.00 |
| Bill (Hobby $5 covers the first $5 of usage) | ≈ $5.70 → $9.00 |

Cloudflare Pages, R2 egress and the cache are free. The total sits inside the $6 to $10 target and well under the $15 hard limit (RUNBOOK, Cost checks).

### Raw output

```
run: 5000 clients, ramp 1m0s, duration 10m0s, hb 45s, resync 5m0s, stat 1m0s, anon 20%, url ws://localhost:8080/v1/ws

clients:        5000 (connected 5000, failed 0, disconnected early 0)
pong latency:   p50 0.29 ms, p95 0.51 ms, p99 1.42 ms (55000 pongs)
bytes received: 4833551 total over 47520.7 client-minutes
bytes/client/min: 101.7 (whole run, join included)

projection for 5000 always-on listeners at $0.050/GB:
  websocket egress (measured bytes):     21.97 GB/month  $1.10
  presence snapshot (5000 B x 5 tiers every 10s):     6.48 GB/month  $0.32
  total:                               $1.42/month

conservative wire model (TCP/IP 52 B per packet and ACK, TLS record 22 B per message, 5000 B TLS handshake per session, join amortised over 30m0s sessions):
  join 761 B; steady 21.6 B/min, 0.32 msgs/min in, 2.55 msgs/min out
  wire bytes/client/min: 409.3  ->    88.40 GB/month  $4.42 (+ snapshot = $4.74/month)

server (peaks over 122 polls):
  RSS 313.0 MiB (VmHWM 313.0 MiB)
  /v1/stats: connections 5000, listeners 5000, goroutines 5007, Go sys 308.2 MiB, heap in use 240.8 MiB
  presence.json: 1504 B gzip, listeners 5000, cells 209
```

Progress (server peaks, every minute):

```
t=1m0s  joined=4942 | conns=4584 sys=178.6MB rss=171.2MB
t=2m0s  joined=5000 | conns=5000 sys=217.4MB rss=208.2MB
t=4m0s  joined=5000 | conns=5000 sys=234.8MB rss=224.9MB
t=6m0s  joined=5000 | conns=5000 sys=268.5MB rss=255.2MB
t=8m0s  joined=5000 | conns=5000 sys=298.0MB rss=286.9MB
t=10m0s joined=5000 | conns=5000 sys=323.2MB rss=313.0MB
```

## Running it again

- Against production (M-E7): `go run . -url wss://tilawah-api.mxmd.dev/v1/ws -n 5000 -ramp 60s -duration 10m -origin https://tilawah.mxmd.dev -stats-token $STATS_TOKEN`. The tester sends no `X-Origin-Auth` unless `-secret` is given; Cloudflare adds it. Over `wss://` the counted bytes already include TLS, and the wire model drops its TLS terms. `MAX_CONNS_PER_IP` (default 5) will refuse a single machine's 5,000 sockets unless raised for the test window.
- `-country` only matters against a server with `TRUST_CF_HEADERS=true`; in production Cloudflare sets the `cf-*` headers from the tester's real location.
- `-hb`, `-resync` and `-stat` compress the schedule for quick checks; the dollar projection is only meaningful with the production defaults.

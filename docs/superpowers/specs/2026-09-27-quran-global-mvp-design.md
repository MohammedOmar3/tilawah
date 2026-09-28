# Tilawah MVP: Design Spec

Status: approved for planning · 2026-09-27
Inputs: the product brief (project chat, 2026-09-27), `reviews/quran-global-brief-review.md`, `reviews/low-cost-architecture.md`.

> One Quran. One moment. A world listening together.

This spec is the single source of truth for the MVP. Every implementation plan in `docs/superpowers/plans/` refers back to it. If a plan and this spec disagree, this spec wins; fix the plan.

---

## 1. Goal and success test

Everyone who opens the site hears the same recitation at the same point, sees which surah and ayah is being recited, and sees a calm 3D globe of where listeners are, in aggregate.

The MVP is done when all of these pass:

| # | Test | Target |
|---|---|---|
| S1 | Playback agreement between clients (wired or Wi-Fi, excluding Bluetooth output latency) | p95 error < 250 ms against the programme clock |
| S2 | Clock sync accuracy | p95 offset error < 100 ms (measured via telemetry RTT/2 bound) |
| S3 | Join button to first audio on 4G | < 3 s |
| S4 | First contentful paint does not wait for the globe | surah, ayah, count and Join render before the globe chunk loads |
| S5 | Globe frame rate | 60 fps desktop, 30 fps mid-range phone |
| S6 | A new listener appears in the counts | within 15 s (one snapshot interval plus cache) |
| S7 | Hosting cost at 5,000 concurrent listeners | at or under $20/month (target $6 to $10) |
| S8 | A 5,000-client load test against one Go instance | holds all sockets, RSS < 400 MB, p99 pong latency < 50 ms |

---

## 2. Decisions and assumptions

The review left five decisions open. The plans use the review's recommended default for each. Each one is isolated behind config or data so it can change without code rework.

| # | Decision | Default used in the plans | Where it lives |
|---|---|---|---|
| D1 | What plays | A continuous khatm (surah 1 to 114, looping) with one reciter | `programme.json` |
| D2 | Which reciter, and rights | Unresolved. Development uses a generated test tone; production audio is ingested at the end (plan 08) once written permission exists | `programme.json`, plan 08 |
| D3 | Translation in MVP | No translation in MVP. The text component has a slot for one, behind `NEXT_PUBLIC_TRANSLATION_ID` (empty = off) | web config |
| D4 | Globe visibility default | Visible by default, with a prominent "Listen anonymously" toggle on the Join screen; k ≥ 5 threshold protects sparse areas | web UI, API `K_MIN` |
| D5 | Postgres and Redis | Deferred. Static JSON plus in-memory presence on one Go instance | architecture |

Further assumptions made while planning:

- **"superman" means the Superpowers plugin for Claude Code** (obra/superpowers). The plans follow its `writing-plans` format so they can be run with `superpowers:subagent-driven-development` (one fresh subagent per task, reviewed between tasks) or `superpowers:executing-plans`.
- **Grid cells instead of H3.** The server snaps locations to a plain latitude/longitude grid (`GRID_DEG`, default 3°, about 330 km), which is pure Go with no cgo. The globe draws each cell as a crescent map pin over a soft glow, sized by count. H3 can replace the grid later behind the same interface.
- **Location comes from Cloudflare headers**, not a GeoIP database. The API sits behind Cloudflare's proxy, which adds `cf-ipcountry` and (with the free "Add visitor location headers" managed transform) `cf-iplatitude`/`cf-iplongitude`. The API snaps them to a grid cell and discards them. If the lat/lng headers are missing it falls back to the country centroid.
- **Audio format:** one file per surah, AAC-LC in `.m4a`, 64 kbps mono, `+faststart`. The iPhone lock-screen and surah-transition behaviour is checked on a real device at the end (manual step M-E6), with `/lab/audio` built as a diagnostic page for it.
- **Drift correction uses a small playback-rate nudge (max ±2%).** Because altering recitation speed may be sensitive, `NEXT_PUBLIC_RATE_NUDGE_MAX=0` turns it off and the player then corrects only by seeking in the gap between ayat.
- **Text source:** Tanzil Uthmani (Hafs), unmodified, with attribution, checksummed in CI.
- **Globe land shapes:** Natural Earth 110m countries (public domain), drawn as an even grid of dots on land (generated at build time). No large Earth texture.
- **No cookies, no accounts, no analytics SDKs.** A privacy notice page is enough for MVP (legal confirmation is a launch step).

---

## 3. Architecture

```
Browser
 ├─ Web app ─────────────► Cloudflare Pages (free)        static Next.js export
 │                          /data/*.json  (surahs, text, timings, programme)
 ├─ Audio ───────────────► tilawah-media.mxmd.dev → Cloudflare cache → R2 (free egress)
 ├─ GET /v1/presence.json► tilawah-api.mxmd.dev → Cloudflare cache (s-maxage=10) → Go
 └─ WS  /v1/ws ──────────► tilawah-api.mxmd.dev → Cloudflare proxy → Go on Railway
                            clock sync, presence, telemetry. Almost nothing sent back.
```

The cost rule: Railway bills outbound bytes; Cloudflare doesn't. Anything identical for every listener is served from Cloudflare. The Go server only sends pong replies, one `welcome` per connection, and one presence snapshot per cache interval per Cloudflare tier.

### 3.1 Position is derived from the clock

```
Programme  = { version, epoch, tracks: [{ surah, durationMs, audio, timings }] }
totalMs    = Σ durationMs
offset(t)  = ((t − epoch) mod totalMs + totalMs) mod totalMs
track i    = the i where prefix[i] ≤ offset < prefix[i+1]
posInTrack = offset − prefix[i]
ayah       = segment in timings[i] containing posInTrack (client-side)
```

No playback state is stored anywhere. Any server, any restart, any client computes the same answer. There is no global pause. The server never announces ayah changes.

### 3.2 Components

| Component | Where | Responsibility |
|---|---|---|
| `packages/contracts` | TS + JSON fixtures | Types, Zod schemas and shared test vectors for every file and message crossing a boundary |
| `tools/quran-data` | Node (tsx) | Builds `surahs.json`, `text/NNN.json`, checksum manifest, dev programme, dev audio, dev timings |
| `apps/api` | Go | `/healthz`, `/v1/ws`, `/v1/presence.json`, `/v1/stats`; in-memory presence; telemetry |
| `apps/web` | Next.js static export | Join flow, sync engine, player, now-playing UI, globe, privacy page |
| `tools/loadtest` | Go | N fake WebSocket clients; reports memory, pong latency |
| `tools/media` | Bash + ffmpeg | Encodes real recitations, builds production programme, uploads to R2 (run at the end) |

---

## 4. Data contracts

All shapes below are normative. `packages/contracts/fixtures/` holds example files and test vectors that both the Go and TS test suites load.

### 4.1 `surahs.json` (served at `/data/surahs.json`)

```json
[
  { "number": 1, "nameArabic": "الفاتحة", "nameTransliterated": "Al-Fatihah",
    "nameEnglish": "The Opening", "ayahCount": 7, "revelation": "meccan" }
]
```
114 entries, ordered by `number`.

### 4.2 `text/NNN.json` (served at `/data/text/001.json` … `114.json`)

```json
{ "surah": 1, "source": "tanzil-uthmani-hafs",
  "ayahs": [ { "n": 1, "text": "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ" } ] }
```
`text/manifest.json` = `{ "source": "...", "files": { "001.json": "<sha256>" , ... } }`. CI fails if any hash changes without the manifest changing in the same commit.

### 4.3 Timings `timings/<reciterId>/NNN.json`

```json
{ "surah": 1, "reciter": "dev-tone",
  "segments": [ { "ayah": 0, "startMs": 0, "endMs": 4000 },
                { "ayah": 1, "startMs": 4200, "endMs": 9000 } ] }
```
- `ayah: 0` is an unnumbered opening segment (isti'adhah or basmala outside Al-Fatihah).
- Segments are sorted, non-overlapping, and may have gaps (silence).
- Lookup rule: the segment containing `pos`; in a gap, the previous segment's ayah; before the first segment, `ayah: 0`.

### 4.4 `programme.json` (served at `/data/programme.json`)

```json
{
  "version": "2026-09-27.1",
  "epoch": "2026-09-01T00:00:00Z",
  "reciter": { "id": "dev-tone", "name": "Development tone", "riwayah": "hafs" },
  "tracks": [
    { "surah": 1, "durationMs": 60000,
      "audio": "/dev-audio/001.wav",
      "timings": "/data/timings/dev-tone/001.json" }
  ]
}
```
`audio` may be absolute (`https://tilawah-media.mxmd.dev/...`) or root-relative. `durationMs` is the exact decoded duration of the audio file.

### 4.5 WebSocket protocol v1 (`/v1/ws`, JSON text frames, max 1 KB inbound)

Client → server:

| `t` | Fields | When |
|---|---|---|
| `hello` | `v: 1`, `anon: bool`, `programme: string` | First message, within 5 s of connect or the server closes the socket |
| `ping` | `id: int`, `c: number` (client ms) | Clock sync bursts |
| `state` | `playing: bool` | When audio starts or stops playing |
| `hb` | – | Every 45 s (keeps Cloudflare's 100 s idle timeout from closing the socket) |
| `stat` | `rttMs`, `offsetMs`, `errMs` (numbers) | Every 60 s while playing |

Server → client:

| `t` | Fields | When |
|---|---|---|
| `welcome` | `v: 1`, `programme: string`, `s: number` (server ms) | Reply to `hello` |
| `pong` | `id`, `c` (echoed), `s: number` (server ms at receipt) | Reply to `ping` |
| `programme` | `version: string` | When the server's programme version differs from the client's (sent after `welcome`) |

Server rules: no reply to `hb`, `state` or `stat`. Idle timeout 120 s without any inbound message. Unknown `t` is ignored. More than 20 messages in 10 s closes the socket (code 1008).

### 4.6 `presence.json` (`GET /v1/presence.json`)

```json
{ "v": 1, "generatedAt": "2026-09-27T16:00:00Z",
  "listeners": 4821, "countries": 82,
  "cells": [ { "lat": 25.5, "lng": 55.5, "n": 481 } ],
  "joins": [ { "lat": 25.5, "lng": 55.5, "n": 3 } ] }
```
- `listeners`: every connection that sent `hello` and `state{playing:true}`, anonymous included.
- `countries`: distinct countries among visible listeners.
- `cells`: visible listeners snapped to the grid cell centre; a cell with `n < K_MIN` is merged into its country's centroid bucket, and a country bucket with `n < K_MIN` is dropped from `cells` (still counted in `listeners`).
- `joins`: per shown cell, the increase since the previous snapshot. Clients spread these pulses randomly across the next interval.
- Response headers: `Cache-Control: public, max-age=5, s-maxage=10`, `Content-Type: application/json`, gzip when accepted, CORS for `ALLOWED_ORIGINS`.

---

## 5. Client behaviour

### 5.1 Join flow
1. Page loads static data (`programme.json`, `surahs.json`) and shows the current surah and ayah immediately using the local clock (approximate, labelled "Now reciting").
2. It fetches `presence.json` and shows the counts. The globe chunk lazy-loads after first paint.
3. The user presses **Join the recitation** (required for autoplay). The toggle "Listen anonymously" sits beside it.
4. Open WS, send `hello`, run an 8-ping clock-sync burst (100 ms apart; keep the lowest-RTT sample).
5. Compute the target position, set `audio.src`, seek, `play()`.
6. On `playing`, send `state{playing:true}`. The listener now counts.

### 5.2 Clock sync
- `now()` = `performance.timeOrigin + performance.now() + offset`. Never `Date.now()` after sync.
- `offset = s − (c0 + c1) / 2` from the lowest-RTT sample of a burst.
- Re-sync with a 3-ping burst every 5 minutes, and immediately on `visibilitychange` to visible, `online`, and reconnect.
- Apply a new offset only if its RTT is ≤ 1.5 × the best RTT seen, or if the last accepted sample is older than 15 minutes.

### 5.3 Drift correction (every 1 s while playing)
`err = audio.currentTime·1000 − (targetPosInTrack + outputLatencyMs)` (the element runs ahead by the output latency so the sound is *heard* on time)

`err` is the median of the last 3 readings (since the last seek or track change), because single `currentTime` reads can be tens of ms off. Every `playbackRate` change can be audible on some browsers, so the rate takes only three values and switches with hysteresis:

| `|err|` | Action |
|---|---|
| ≤ 100 ms at `playbackRate = 1` | keep `playbackRate = 1` |
| > 100 ms | `playbackRate = 1 ∓ RATE_MAX` (slower when ahead), held until `err` is back within 20 ms or changes sign, then `1`; if `RATE_MAX = 0`, seek at the next ayah gap instead |
| > 1000 ms (acted on from a single reading), or > 250 ms after a stall (`waiting` → `playing`) | hard seek to target |

After a seek, no correction runs until the playhead has moved (at most 5 ticks): iOS Safari holds still for over a second after each seek without firing `waiting`, and measuring during that time caused a seek every 2 s. The first reading after a seek gives the element's resume delay; later seeks aim that far ahead (the seek lead, 0 to 3 s) so they land on time.

At a track boundary the player swaps `src` to the next track (preloaded 30 s ahead in a second `<audio>` element) and seeks to the computed position.

### 5.4 Reconnect and backgrounding
- Reconnect with exponential backoff (1 s, 2 s, 4 s … max 30 s) plus full jitter.
- Audio keeps playing while the socket is down; position is clock-derived.
- Media Session API: title = surah name, artist = reciter, artwork = app icon.

### 5.5 Accessibility and calm
- Everything reachable by keyboard; visible focus rings.
- The current ayah is exposed as text; an opt-in "Announce ayat" setting uses a polite `aria-live` region. Off by default.
- `prefers-reduced-motion`: static globe, no pulses, no auto-rotation.
- Arabic text `dir="rtl"` `lang="ar"` in a Quranic font (KFGQPC Uthmanic Script Hafs or equivalent whose licence allows web embedding; the free fallback is Amiri Quran from Google Fonts).

---

## 6. Server behaviour

- Go 1.24, `net/http` + `chi`, `github.com/coder/websocket`, `log/slog` JSON logs.
- Config from environment only:

| Var | Default | Meaning |
|---|---|---|
| `PORT` | 8080 | Listen port |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | Comma list; WS origin check and CORS |
| `ORIGIN_SECRET` | empty | If set, requests must carry `X-Origin-Auth: <secret>` (added by a Cloudflare transform rule), else 403. `/healthz` exempt |
| `PROGRAMME_VERSION` | `dev` | Sent in `welcome` |
| `SNAPSHOT_INTERVAL` | 10s | Presence rebuild interval |
| `GRID_DEG` | 3 | Grid cell size in degrees |
| `K_MIN` | 5 | Minimum listeners before a cell or country bucket is shown |
| `MAX_CONNS` | 20000 | Global connection cap (503 beyond) |
| `MAX_CONNS_PER_IP` | 5 | Per-IP cap, tracked by salted hash, salt rotates daily, memory only |
| `STATS_TOKEN` | empty | Bearer token for `/v1/stats`; empty disables the endpoint |
| `TRUST_CF_HEADERS` | false | Read `cf-*` headers only when true (prod) |

- Client IP: `CF-Connecting-IP` when `TRUST_CF_HEADERS`, else the TCP peer. Used for the per-IP cap (hashed) and nothing else.
- Location: read once at `hello` (skipped entirely when `anon: true`), snapped to the grid, raw values dropped.
- Graceful shutdown on SIGTERM: stop accepting, close sockets with 1012 (service restart) so clients reconnect with jitter.
- `/v1/stats` returns JSON: connections, listeners, p50/p95 of `rttMs`, `|errMs|` and `|offset change|` over the last 10 minutes, Go memory stats.

---

## 7. Repository layout

```
tilawah/
├─ CLAUDE.md                     conventions every subagent reads first
├─ README.md
├─ package.json, pnpm-workspace.yaml, .nvmrc, .editorconfig, .gitignore
├─ packages/contracts/           TS types, Zod schemas, fixtures/
├─ apps/web/                     Next.js (App Router, output: 'export')
│  ├─ app/  components/  lib/sync/  lib/data/  globe/  player/
│  └─ public/data/ (generated)  public/dev-audio/ (generated, gitignored)
├─ apps/api/                     Go module github.com/MohammedOmar3/tilawah/apps/api
│  ├─ cmd/server/  internal/{config,httpapi,ws,presence,geo,telemetry,programme}
│  └─ Dockerfile
├─ tools/quran-data/  tools/loadtest/  tools/media/
├─ data/sources/                 Tanzil files, Natural Earth (downloaded, committed)
├─ docs/  (specs, plans, SETUP-MANUAL.md, FEATURES.md)
└─ .github/workflows/ci.yml, deploy-web.yml
```

---

## 8. Out of scope for the MVP

Postgres, Redis, multiple API instances, accounts, city names, reciter and surah pickers, personal mode, scheduled sessions, statistics pages, translations beyond the one optional slot, PWA install, native apps, admin UI.

The architecture keeps room for them: scheduled sessions become programme overrides with an `effectiveAt`; a second instance adds Redis for summed per-instance aggregates; personal mode is a client that stops following the programme clock.

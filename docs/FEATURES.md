# Tilawah: Feature List

Every MVP feature has an ID, the plan that builds it, and an acceptance check. "Later" features are listed so nothing in the MVP blocks them.

Legend: **MVP** = ships in the first release · **Later** = designed for, not built.

## A. Global synchronized listening

| ID | Feature | Scope | Plan | Accepted when |
|---|---|---|---|---|
| A1 | Continuous looping programme (khatm, one reciter) derived from a fixed epoch | MVP | 02, 04 | Go and TS return identical track/position for every shared test vector |
| A2 | Current surah name and number shown | MVP | 05 | Matches `programme.json` at any clock time |
| A3 | Current ayah number and Arabic text, visually emphasised | MVP | 05 | Highlight changes within 100 ms of the timing boundary in the dev programme |
| A4 | Progress through the current surah (bar + elapsed time) | MVP | 05 | Bar position equals `posInTrack / durationMs` |
| A5 | Join button starts audio at the live position | MVP | 04, 05 | Two browsers joined 30 s apart agree within 250 ms (Playwright e2e) |
| A6 | NTP-style clock sync over WebSocket | MVP | 03, 04 | Unit tests with simulated skew and asymmetric latency converge within 20 ms of RTT/2 |
| A7 | Drift correction (rate nudge, seek on large error or stall) | MVP | 04 | Simulated drift of 500 ms converges below 40 ms without a seek; ±80 ms read jitter causes no rate changes |
| A8 | Rate-nudge off switch (seek at ayah gaps only) | MVP | 04 | With `RATE_MAX=0`, `playbackRate` never leaves 1 |
| A9 | Gapless-as-possible surah transitions (preload next track) | MVP | 04 | Next track element has `readyState ≥ 3` before the boundary in e2e |
| A10 | Reconnect with jittered backoff; audio continues | MVP | 04 | Killing the API for 10 s does not stop audio; socket returns |
| A11 | Resync on tab foreground, `online`, reconnect | MVP | 04 | Unit tests assert a burst is triggered on each event |
| A12 | Lock-screen metadata (Media Session) | MVP | 05 | `navigator.mediaSession.metadata.title` equals the surah name |
| A13 | Scheduled sessions (programme overrides with `effectiveAt`) | Later | – | – |
| A14 | Personal mode | Later | – | – |

## B. Presence and counts

| ID | Feature | Scope | Plan | Accepted when |
|---|---|---|---|---|
| B1 | Listener total (counted once audio is playing) | MVP | 03 | Integration test: 3 fake clients playing → `listeners: 3` |
| B2 | Country count (visible listeners only) | MVP | 03 | Fixture with 3 countries → `countries: 3` |
| B3 | Presence snapshot every 10 s, served via Cloudflare cache | MVP | 03, 07 | Response carries `s-maxage=10`; handler serves pre-built bytes |
| B4 | Counts shown in UI and refreshed every 15 s | MVP | 05 | UI updates after a fixture change |
| B5 | Client heartbeat every 45 s; server idle timeout 120 s | MVP | 03, 04 | Silent client is dropped after 120 s in test with a fake clock |
| B6 | "Listened today" secondary figure | Later | – | – |

## C. Globe

| ID | Feature | Scope | Plan | Accepted when |
|---|---|---|---|---|
| C1 | 3D Earth, dotted land, calm Night and Fajr styles | MVP, restyled in phase 2 | 06 | Renders from Natural Earth data with no texture download |
| C2 | Listener cells as crescent map pins over a soft glow, sized by count (log scale) | MVP, restyled in phase 2 | 06 | Fixture cells render with correct relative sizes |
| C3 | Gentle pulses for batched joins, spread across the interval | MVP | 06 | Pulses fire at randomised times, never all at once |
| C4 | Rotate and zoom (mouse, touch, keyboard) | MVP | 06 | Arrow keys rotate; +/- zoom; limits enforced |
| C5 | Slow auto-rotation, paused on interaction | MVP | 06 | Resumes after 10 s idle |
| C6 | Lazy-loaded after first paint | MVP | 05, 06 | Globe JS is a separate chunk; S4 passes in Lighthouse |
| C7 | Reduced motion: static, no pulses, no auto-rotate | MVP | 06 | Emulated reduced-motion test |
| C8 | Mobile caps (pixel ratio ≤ 2, pause when hidden) | MVP | 06 | Render loop stops on `visibilitychange` hidden |
| C9 | H3 cells instead of a lat/lng grid | Later | – | – |

## D. Privacy and safety

| ID | Feature | Scope | Plan | Accepted when |
|---|---|---|---|---|
| D1 | Location from Cloudflare headers, snapped to a 3° cell, raw value discarded | MVP | 03 | Unit test: output only contains cell centres; no raw lat/lng stored in any struct |
| D2 | k ≥ 5 threshold, roll-up to country, drop if still < 5 | MVP | 03 | Fixture with 4 listeners in one country shows no cell |
| D3 | Anonymous mode: counted in total, never geolocated | MVP | 03, 05 | `anon:true` never calls the locator (test with a spy) |
| D4 | Per-IP connection cap via rotating salted hash, memory only | MVP | 03 | 6th connection from one IP is refused |
| D5 | Origin check and origin secret header | MVP | 03 | Wrong origin → 403; missing secret in prod → 403 |
| D6 | Message size and rate limits | MVP | 03 | 21 messages in 10 s → close 1008 |
| D7 | Privacy notice page | MVP | 05 | `/privacy` exists and describes exactly what the API does |
| D8 | No cookies, no third-party analytics | MVP | 05 | CI check: no `document.cookie` writes, no analytics packages |

## E. Quran content

| ID | Feature | Scope | Plan | Accepted when |
|---|---|---|---|---|
| E1 | Surah metadata for all 114 surahs | MVP | 02 | 114 entries; ayah counts sum to 6,236 |
| E2 | Uthmani text, unmodified, checksummed | MVP | 02 | CI checksum test passes; 6,236 ayahs |
| E3 | Timing files per surah, validated | MVP | 02 | Validator rejects overlaps and unsorted segments |
| E4 | Dev programme with generated test-tone audio | MVP | 02 | `pnpm data:dev` produces playable audio + timings for 3 surahs |
| E5 | Production programme from real recitations | MVP (at end) | 08 | 114 tracks, durations measured from files, uploaded to R2 |
| E6 | Quranic font, RTL, ayah-end markers | MVP | 05 | Visual check by a knowledgeable reviewer (M-E8) |
| E7 | One translation (optional slot) | Later (slot in MVP) | 05 | Hidden when `NEXT_PUBLIC_TRANSLATION_ID` is empty |
| E8 | Surah browser, reciter selection | Later | – | – |

## F. Accessibility

| ID | Feature | Scope | Plan | Accepted when |
|---|---|---|---|---|
| F1 | Keyboard operable, visible focus | MVP | 05 | Playwright tab-through test reaches Join, toggle, settings, globe |
| F2 | Screen-reader text for surah/ayah/counts | MVP | 05 | axe-core: zero serious violations |
| F3 | Opt-in polite ayah announcements | MVP | 05 | Off by default; on → `aria-live="polite"` region updates |
| F4 | Reduced motion respected across the app | MVP | 05, 06 | Emulated test |

## G. Operations

| ID | Feature | Scope | Plan | Accepted when |
|---|---|---|---|---|
| G1 | CI: Go tests, web typecheck/lint/unit, contracts, data checksums | MVP | 01, 07 | Green on every PR |
| G2 | Health check and graceful shutdown | MVP | 03 | SIGTERM closes sockets with 1012 |
| G3 | Sync telemetry and `/v1/stats` | MVP | 03, 04 | p95 values appear after a local e2e run |
| G4 | Load test tool (5,000 clients) | MVP | 07 | S8 passes locally |
| G5 | Web deploy to Cloudflare Pages via GitHub Actions | MVP | 07 | Runs on push to `main` once secrets exist |
| G6 | API deploy to Railway (Dockerfile) | MVP | 07 | Image builds in CI; Railway auto-deploys `main` |
| G7 | `/lab/audio` diagnostic page for device testing | MVP | 05 | Shows target vs actual position, rate, output latency |

# Quran Global: Brief Review

Reviewer: Claude · 2026-09-27 · Scope: the product and technical brief posted in the Tilawah project chat. No code exists yet, so this is a design review only.

**Overall verdict:** The vision is clear and well-constrained, and the big architectural calls are right (server-authoritative time, audio off the Go server, ephemeral presence, modular monolith, aggregated geo). The brief is weakest exactly where the product is hardest: it never says *what plays* after the current surah ends, *where the audio and ayah timings come from* and under what licence, *how location is obtained*, and *how accurate "synchronized" must be*. Those four gaps should be decided before Phase 1, because each one changes the data model.

---

## 1. Top 10 findings (ranked)

| # | Finding | Severity | Recommendation |
|---|---|---|---|
| 1 | The session has no programme. Nothing says what plays after Al-Kahf ends, who pauses a global session, or how scheduled sessions coexist with the one global one. | High | Define the global session as a deterministic, looping **programme** (e.g. a continuous khatm, Al-Fatiha to An-Nas). See §2. |
| 2 | The sync formula `serverTime - sessionStartTime + audioOffset` only works for a single file that never pauses. | High | Position = f(schedule, epoch, now). Track index and offset are derived, not stored. See §2. |
| 3 | Audio rights are one sentence ("appropriate licensing"). Reciter recordings are copyrighted; self-hosting them on your CDN needs permission. | High (blocker for launch) | Pick one reciter and secure written permission, or stream from a provider whose terms allow it. See §4. |
| 4 | Ayah timing data is assumed but never sourced. Without it you cannot highlight the current ayah. | High | Choose audio and timings as a pair: gapless per-surah recordings that ship with verse timestamps. See §5. |
| 5 | Location source is unspecified. Browser GPS would contradict the privacy principle; IP geolocation needs a database and a licence. | High | Server-side IP → coarse hex cell at connect time, then discard the IP. Never use the Geolocation API. See §3. |
| 6 | Aggregation alone doesn't guarantee privacy. A cell showing "1 listener" in a small town, pulsing the moment someone joins, identifies that person. In some countries that is a safety issue. | High | Minimum-count threshold (k ≥ 5) before a cell is shown, coarse cells, batched and delayed join pulses. See §3. |
| 7 | "Synchronized" has no target number, so neither drift correction nor the MVP success test can pass or fail. | Medium | Set targets, e.g. p95 clock-sync error < 100 ms, p95 playback error < 250 ms, and collect client telemetry to prove it. See §2.6. |
| 8 | The Redis presence design (`listener:{session}:{id}` keys with TTL) makes counting require a key scan, and per-listener `presence.joined/left` events fan out O(N²). | Medium | Connection *is* presence. Aggregate in memory per instance, publish per-instance cell counts, broadcast snapshots every few seconds. See §3.4. |
| 9 | CDN egress is the real cost driver and isn't mentioned. At 128 kbps, 5,000 concurrent listeners ≈ 290 GB/hour ≈ 7 TB/day. | Medium | Encode at 64 to 96 kbps AAC, serve from a zero-egress store (e.g. Cloudflare R2), never from Vercel. See §6.3. |
| 10 | Phases are horizontal layers; the globe (the "central" feature) and accessibility arrive last. | Medium | Build a thin vertical slice first (sync + count + basic globe end-to-end), accessibility from day one. See §7. |

---

## 2. Synchronization

### 2.1 What the brief gets right
Server-authoritative state, gradual correction instead of hard seeks, and an explicit list of failure modes (latency, clock skew, backgrounding, drift) are all correct.

### 2.2 The model needs a programme, not a start time
The example state `{surah: 18, ayah: 23, startedAt, status}` mixes stored and derived values. If `startedAt` and the audio are known, `ayah` is derived and will go stale. And `status: paused` implies someone can pause the whole world, which the brief never defines.

Recommended model:

```
Programme  = versioned ordered list of tracks [{surah, reciter, durationMs, url, timingsUrl}]
Epoch      = fixed UTC instant the programme started looping
Total      = sum(durationMs)
Now (t)    → offset = (t - Epoch) mod Total
           → track = first i where prefixSum[i+1] > offset
           → positionInTrack = offset - prefixSum[i]
           → ayah = lookup(timings[track], positionInTrack)   (client-side)
```

Why this is better:
- **Stateless.** Any Go instance computes the same answer from its NTP-synced clock. No Redis state for playback, and it survives restarts and deploys.
- **No per-ayah broadcasts.** Clients derive the current ayah locally, so `session.ayah_changed` disappears. The server only sends a message when the programme itself changes.
- **Future features fit.** Scheduled sessions ("Al-Mulk nightly at 20:00 UTC", Al-Kahf on Fridays) become programme overrides published *ahead of time* with an effective timestamp, so every client switches at the same instant. Pausing becomes "no global pause"; personal mode is simply a client that stops following the programme.

Decision needed: what the default programme is. A continuous khatm with one reciter is the simplest honest answer and runs roughly 20 to 30 hours per cycle depending on the reciter.

### 2.3 Clock sync
- Run an NTP-style exchange over the WebSocket at connect: 5 to 8 pings, keep the sample with the lowest round-trip time, `offset = serverTs - (t0 + t1) / 2`.
- Use `performance.now()` (monotonic) plus the offset, never `Date.now()`, which jumps when the OS adjusts the clock.
- Re-sync every 30 to 60 s and immediately on `visibilitychange`, `online`, and reconnect.
- Single-region Railway means Jakarta sees higher RTT; that only affects clock-estimate accuracy (asymmetric paths), not audio, because audio comes from the CDN.

### 2.4 Drift correction
Suggested thresholds (to be tuned with telemetry):
- |error| < 40 ms: do nothing.
- 40 ms to ~1 s: nudge `playbackRate` within ±2 to 3% until converged.
- > 1 s, or after a stall: hard seek, **ideally in the silence between ayat** so it isn't heard mid-word.

Two things to flag:
- **Altering recitation speed is a religious-sensitivity question**, not just a technical one. ±2% is barely perceptible, but some listeners and scholars may object to any alteration. Preferring seeks at ayah boundaries (you'll have the timings) sidesteps most of it. Worth a quick check with someone you trust.
- **Output latency** (Bluetooth headphones add 150 to 300 ms) is invisible to `audio.currentTime`. `AudioContext.outputLatency` compensates where supported (Chrome, Firefox); Safari support is partial. Accept this as a known limit.

### 2.5 Audio delivery format (matters more than it looks)
- **VBR MP3 seeks inaccurately** in browsers (seconds of error on long files). Use CBR, or AAC.
- **Transitions between surahs** with a plain `<audio>` element produce a small gap and, on iOS, can fail while the screen is locked.
- **Recommended to spike first:** package the whole programme as an **HLS VOD playlist** (AAC, ~6 s segments). Native on Safari, hls.js elsewhere (iPhone Safari 17.1+ has Managed Media Source). You get gapless transitions, lock-screen continuity, and exact seeks by time. Cost: a packaging step and ~60 KB of JS.
- Fallback if HLS is too much for MVP: per-surah CBR files, preload the next surah 30 s ahead, accept a short gap at surah boundaries (recitations have silence there anyway).
- Per-ayah files (everyayah-style) give free timings but gaps between every ayah; not recommended for a continuous experience.

### 2.6 Mobile and browser realities to design for
- **Autoplay:** audio must start from a user gesture. The "Join" button solves this; don't try to autoplay on load.
- **Backgrounding:** on iOS the audio element keeps playing when locked, but timers are throttled and the WebSocket may be dropped. On foreground: reconnect, re-sync clock, correct. Add Media Session API metadata so the lock screen shows surah and reciter.
- **Buffering:** on `waiting` → `playing`, recompute the target position and seek; don't resume from where it stalled.
- **Deploys:** every Railway deploy drops all sockets. Reconnect with jittered exponential backoff so 5,000 clients don't hit the server in the same second. Because position is time-derived, audio keeps playing correctly through a reconnect.

### 2.7 Make sync measurable
Clients should report (sampled, anonymous) their clock-sync RTT and playback error every minute. That's how you prove the "Dubai, London, Jakarta" test passes, and it's the only way to tune thresholds. Build a headless test harness that runs N simulated clients with skewed clocks and injected latency.

---

## 3. Presence and geographic privacy

### 3.1 How location is obtained (missing from the brief)
- **Do not** use the browser Geolocation API: it prompts, returns GPS-precise data, and contradicts principle 4.
- **Do** geolocate the IP server-side, once at connect, map it to a coarse cell, and drop the IP from memory. Nothing written to disk.
- The WebSocket goes to Railway, which (unlike Vercel or Cloudflare) doesn't add geo headers, so the Go API needs a local IP database: MaxMind GeoLite2 (free, requires an account, EULA, attribution) or DB-IP Lite (CC BY 4.0). Verify current terms before choosing. Alternatively, put Cloudflare in front of the API and read its country header (country only).
- VPNs and mobile carriers will misplace some users; that's acceptable for an aggregate globe.

### 3.2 Aggregation is necessary but not sufficient
- Use a hierarchical hex grid (Uber **H3**) instead of city names and coordinates. The brief's own example payload exposes city coordinates to 2 decimal places (~1 km); a cell centroid at H3 resolution 2 to 3 (tens of thousands of km²) is far safer and renders beautifully as hexbins on a globe.
- **k-anonymity threshold:** don't render a cell with fewer than ~5 listeners; roll it up into its parent cell or the country. Consider the same for country counts in small countries.
- **Join pulses leak timing.** A pulse the instant one person joins in a sparse area identifies them. Batch joins per cell and emit them with the next snapshot (every few seconds), and only for cells above the threshold.
- In some countries, being seen listening to the Quran could put someone at risk. This is a stronger reason than usual to be conservative.

### 3.3 Anonymous mode, precisely defined
Open questions the brief leaves: are anonymous listeners still in the total count? Is visibility opt-in or opt-out?

Recommendation: everyone counts toward the total; the globe and country count include only visible listeners; anonymous mode is sent in the first WebSocket message *before* geolocation runs, so the server never looks up that IP at all. Given the privacy principle, consider anonymous as the default for regions with small listener counts, or simply make the toggle prominent on the join screen.

Legal note: IP addresses are personal data under GDPR even if processed momentarily. With no cookies and no storage you likely need only a clear privacy notice (legitimate interest), not a consent banner, but get that confirmed before launch.

### 3.4 Presence architecture
The brief's per-listener Redis keys with TTL have two problems: counting them requires `SCAN` (O(N)), and `presence.joined/left` broadcast per listener is O(N²) messages at scale.

Simpler and more scalable:
- **The WebSocket connection is the heartbeat.** Use WS ping/pong; no separate heartbeat to Redis.
- Each Go instance keeps an in-memory map `cell → count`.
- Single instance (MVP): broadcast a `presence.snapshot` (totals, countries, cells above threshold, batched join pulses) every 2 to 5 s. No Redis needed.
- Multiple instances (later): each instance writes its own aggregate to Redis as one key with a short TTL (`presence:instance:{id}`); any instance sums them. Cost is O(instances), not O(listeners). A dead instance's key expires on its own, which gives you the brief's "TTL expires, listener disappears" property for free.
- Count only clients whose audio is actually playing (not just an open tab), and dedupe per-browser across tabs if feasible.

### 3.5 Abuse
A public counter invites inflation. Add per-IP connection limits, WS origin checks, message size and rate limits, and don't count a connection until it has completed clock sync and reported playback.

---

## 4. Audio sourcing and licensing

- **Recordings are copyrighted** by the reciter and/or producer, even though the Quran text is not. Many popular sites host recitations with permission; that permission doesn't transfer to you. Copying their files to your own R2 bucket needs your own permission.
- Options, in order of preference:
  1. Contact a reciter or their publisher directly and get written permission to stream (this is often granted for non-commercial dawah projects).
  2. Use a provider's API or CDN under terms that explicitly allow it (e.g. the Quran Foundation / Quran.com APIs; check their current terms, which now require registered API clients).
  3. Use recordings with an explicit open licence, if a suitable one exists.
- **Match riwayah across audio and text.** If the text is Hafs 'an 'Asim, the audio must be too.
- **Commit to non-commercial and no ads** in writing; it both fits the principles and makes permission easier to obtain.
- The brief's "reciter selection" is really a programme decision (one reciter per global session), not a user control. Say so to avoid building the wrong UI.

## 5. Ayah timing data and Quran text

- **Timings:** you need `[ayah, startMs, endMs]` per surah per reciter. The practical route is to pick a reciter for whom gapless per-surah recordings *and* verse timestamps already exist (Quran.com's chapter recitations publish these for several reciters). Producing your own via forced alignment is possible but slow and needs manual QA. Recommend: audio source and timing source are chosen together as one decision.
- **Edge cases the timing model must handle:** the basmala (an ayah only in Al-Fatiha, absent in At-Tawbah, recited but unnumbered elsewhere), any isti'adhah at the start of a recording, and silence at file boundaries.
- **Text integrity:** use a verified Uthmani text source (e.g. Tanzil, whose licence requires attribution and forbids modifying the text; verify current terms), never hand-edit, and add a checksum test in CI so the text can't be altered by accident.
- **Font:** Uthmani script needs a proper Quranic font (e.g. KFGQPC Uthmanic Script Hafs); check its licence. Plan for RTL layout, ayah-end markers, and sajdah indicators.
- **Translations** are separately copyrighted per translator (Saheeh International, for instance, is not freely licensed). Resolve rights before promising them. Given that most Muslims don't read Arabic, one English translation may belong in the MVP; that's a product call for you.
- Get a knowledgeable person to review the text rendering and any audio handling before public launch.

---

## 6. Stack and scaling

### 6.1 Frontend (Next.js on Vercel)
- Fine. The page is almost entirely client-side, so SSR buys little beyond the first paint and metadata. Keep all API logic in Go; drop "frontend APIs where appropriate" to avoid two backends.
- **Lazy-load the globe.** three.js + R3F + textures can outweigh the rest of the app. Render surah, ayah, count and the Join button first; stream the globe in behind them. That's how "fast initial load" and "3D globe" coexist.
- Consider `three-globe` / `react-globe.gl` (hexbin layers, arcs, rings) before hand-building; they sit on three.js and save weeks.
- Reduced motion: static globe, no pulses, no auto-rotation. Mobile: cap pixel ratio and particle counts, pause rendering when the tab is hidden.

### 6.2 Backend (Go on Railway)
- Modular monolith is the right call. `net/http` + chi + `coder/websocket` (or gorilla/websocket) is plenty.
- One Go instance comfortably holds tens of thousands of mostly idle sockets at this message rate. Snapshot every 5 s to 50,000 clients is 10,000 small writes/second, which is fine.
- **Postgres isn't needed for the MVP.** 114 surahs, 6,236 ayahs, a few reciters and timings are static: generate JSON at build time and serve it from the CDN (the client needs it anyway). Postgres earns its place with scheduled sessions and statistics.
- **Redis isn't needed until a second instance exists** (see §3.4). Keep the interfaces, defer the infrastructure. Fewer moving parts means fewer of the "Redis/DB failure handling" requirements to build.
- Railway runs in one region: fine for this design because only the control plane lives there.

### 6.3 Cost
Audio egress dwarfs everything else. Rough numbers at 5,000 concurrent listeners:

| Bitrate | Per listener-hour | 5,000 concurrent, per day |
|---|---|---|
| 128 kbps | ~58 MB | ~7 TB |
| 64 kbps | ~29 MB | ~3.5 TB |

Recitation sounds good at 64 to 96 kbps AAC. Serve from a store without egress fees (Cloudflare R2 is the obvious fit) and never proxy audio through Vercel or Railway.

### 6.4 Things the brief doesn't cover
- Observability: structured logs, sync-error telemetry, connection counts, CDN hit rate.
- Load testing the WS server and sync harness (§2.7).
- Domain, name and trademark check for "Quran Global".
- The cold-start problem: at launch the globe may show 3 listeners. Don't fake numbers (it would violate the principles); consider a calm "listened today" figure as a secondary line.

---

## 7. Contradictions and smaller issues

- `status: paused` and `session.paused` vs a single always-on global session. Who pauses? Recommend: no global pause.
- `session.ayah_changed` from the server vs a client-derivable position. Recommend: derive client-side.
- The privacy principle vs an example payload with ~1 km-precise city coordinates. Recommend: hex cell centroids.
- "Reciter selection" and "Surah selection" (Phase 6) are user controls, but the global session has one reciter and one surah. Clarify they're for browsing or personal mode, or they're programme settings.
- Accessibility is in Phase 6 but is a stated non-functional requirement. Also, an `aria-live` region announcing each ayah every few seconds would be overwhelming for screen-reader users; make it polite and opt-in.
- The globe is "central, not optional" but arrives in Phase 5.

## 8. Recommended MVP scope

**Keep:**
- One continuous programme, one reciter, one riwayah, with rights secured.
- Time-derived sync, clock sync, drift correction, reconnect, background resume.
- Arabic text with the current ayah highlighted (plus one translation if rights allow).
- Total listeners, country count, H3 hexbin globe with thresholds, rotate and zoom.
- Anonymous toggle on the join screen.
- Sync telemetry and a privacy notice.

**Defer:** Postgres, Redis, multiple instances, city names, reciter/surah pickers, scheduled sessions, statistics, PWA.

**Measurable MVP success test** (replaces "approximately the same point"):
- p95 playback error < 250 ms across clients on wired or Wi-Fi, excluding Bluetooth output latency.
- Join to first audio < 3 s on 4G.
- Globe at 60 fps desktop, 30 fps mid-range phone; first contentful paint without waiting for the globe.
- A new listener appears in the counts within 5 s.

**Suggested build order** (vertical slices instead of layers):
1. Spike: HLS vs per-surah audio on iOS Safari (locked screen, surah transition, seek accuracy). This de-risks the most.
2. Go service with the programme function and clock-sync endpoint; a bare page that plays in sync. Test with two phones in the same room.
3. Presence counts and a simple globe, end-to-end.
4. Ayah highlighting from timings, polish, accessibility, anonymous mode.
5. Deploy pipeline and telemetry, then load testing.

## 9. Decisions needed from Mohammed

1. **What plays?** Continuous khatm (recommended), or a curated rotation?
2. **Which reciter,** and do you have (or can you request) permission to stream them?
3. **One translation in the MVP?** Yes or no, and which.
4. **Globe visibility default:** visible, or anonymous by default?
5. **Defer Postgres and Redis** until after the MVP? (Recommended: yes.)

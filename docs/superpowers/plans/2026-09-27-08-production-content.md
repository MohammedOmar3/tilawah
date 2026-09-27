# Plan 08: Production Content Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the development tone with the real recitation: encode 114 surah files, convert the verse timings to the spec format, build and validate the production `programme.json`, and upload the audio to R2.

**Architecture:** A small `tools/media` workspace package. Pure converters (source timings → spec timings, durations → programme) are unit-tested. Encoding shells out to `ffmpeg`/`ffprobe`. Upload uses the S3-compatible R2 API with immutable, versioned keys so Cloudflare can cache files for a year.

**Tech stack:** Node 22 + tsx, `@tilawah/contracts`, `@aws-sdk/client-s3` (this plan may add exactly these dependencies to `tools/media`), ffmpeg/ffprobe.

**Owns:** `tools/media/`; regenerates `apps/web/public/data/programme.json` and `apps/web/public/data/timings/<reciterId>/`.

**Blocked until (manual):** **M-S5** written permission received; **M-E2** R2 bucket, custom domain and token exist; the source recordings and verse timings are on disk. If any is missing, stop and report which.

**Inputs (provided by the human):**
```
tools/media/input/<reciterId>/audio/001.mp3 … 114.mp3        gapless per-surah recordings (any format ffmpeg reads)
tools/media/input/<reciterId>/timings/001.json … 114.json    verse timings from the same source
tools/media/input/<reciterId>/reciter.json                   { "id", "name", "riwayah": "hafs" }
```
`input/` is gitignored (the recordings are licensed to us, not redistributable in the repo).

---

### Task 1: Package scaffold

**Files:** Create `tools/media/package.json`, `tools/media/tsconfig.json`, `tools/media/.gitignore` (`input/`, `output/`)

- [ ] **Step 1:** name `media`, scripts `test`, `typecheck`, `encode`, `build-programme`, `upload`. `pnpm --filter media add @tilawah/contracts@workspace:* @aws-sdk/client-s3 && pnpm --filter media add -D tsx typescript vitest @types/node`.
- [ ] **Step 2: Commit** — `Scaffold media tool`

---

### Task 2: Timing converter

**Files:** Create `tools/media/src/timings.ts`, `tools/media/src/timings.test.ts`

- [ ] **Step 1: Write failing tests.** The expected source format is Quran.com's chapter-recitation timestamps:
```json
{ "audio_file": { "chapter_id": 18, "timestamps": [
  { "verse_key": "18:1", "timestamp_from": 5120, "timestamp_to": 17840 },
  { "verse_key": "18:2", "timestamp_from": 17840, "timestamp_to": 30210 } ] } }
```
  - converts to `{ surah: 18, reciter, segments: [{ ayah: 1, startMs: 5120, endMs: 17840 }, …] }`;
  - adds `{ ayah: 0, startMs: 0, endMs: <first start> }` when the first verse starts after 1000 ms (isti'adhah/basmala);
  - applies a global `offsetMs` (can be negative; results clamped at 0) to correct encoder delay found during M-E8;
  - rejects a verse_key from another surah, missing ayahs, or overlaps (via `Timings.parse`).
  If the permission came with timings in another format, add a second converter with its own tests; keep the output identical.
- [ ] **Step 2–4:** fail, implement, pass. · **Step 5: Commit** — `Convert source verse timings`

---

### Task 3: Encode and measure

**Files:** Create `tools/media/src/encode.ts`, `tools/media/src/encode.test.ts`

- [ ] **Step 1: Test** the pure parts: `ffmpegArgs(input, output)` returns
  `["-y", "-i", input, "-vn", "-ac", "1", "-ar", "44100", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", output]`; `parseFfprobeDurationMs("123.456789\n")` → `123457`.
- [ ] **Step 2–4:** fail, implement, pass.
- [ ] **Step 5: Implement the runner**: for each of 114 inputs, encode to `output/<reciterId>/NNN.m4a` (skip if newer than input), then `ffprobe -v error -show_entries format=duration -of csv=p=0` for `durationMs`. Write `output/<reciterId>/durations.json`. Run `pnpm --filter media encode <reciterId>`; expect ~1 GB of output for a full khatm at 64 kbps.
- [ ] **Step 6: Commit** — `Encode recitations to AAC and measure durations`

---

### Task 4: Build the production programme

**Files:** Create `tools/media/src/programme.ts`, `tools/media/src/programme.test.ts`, `tools/media/src/build-programme.ts`

- [ ] **Step 1: Test** `buildProgramme({ reciter, durations, mediaBase, keyVersion, epoch, version })`:
  - 114 tracks in order 1..114;
  - `audio = ${mediaBase}/${reciter.id}/${keyVersion}/NNN.m4a` (absolute), `timings = /data/timings/${reciter.id}/NNN.json`;
  - passes `Programme.parse`;
  - `version` format `YYYY-MM-DD.N`.
- [ ] **Step 2–4:** fail, implement, pass.
- [ ] **Step 5: Implement `build-programme.ts`**: converts all timings (Task 2) into `apps/web/public/data/timings/<reciterId>/`, checks each last `endMs` ≤ its track's `durationMs` (if a timing overruns by < 500 ms, clamp and log; otherwise fail), writes `apps/web/public/data/programme.json` with `epoch` = the launch date at 00:00 UTC (argument), and runs `pnpm data:validate` (production mode). Remove the `dev-tone` timings from `programme.json` only; `programme.dev.json` stays for development and e2e.
- [ ] **Step 6: Commit** — `Build production programme and timings`

---

### Task 5: Upload to R2

**Files:** Create `tools/media/src/upload.ts`, `tools/media/src/upload.test.ts`

- [ ] **Step 1: Test** `objectParams(file, reciterId, keyVersion)` → `{ Key: "<reciterId>/<keyVersion>/NNN.m4a", ContentType: "audio/mp4", CacheControl: "public, max-age=31536000, immutable" }`.
- [ ] **Step 2–4:** fail, implement, pass.
- [ ] **Step 5: Implement the runner**: S3 client with `endpoint: https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, `region: "auto"`, credentials from `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`, bucket from `R2_BUCKET` (`quran-tilawah-media`). `HeadObject` first; skip files whose size matches. Upload with 4 in parallel. Never delete objects. Then `curl -sI https://tilawah-media.mxmd.dev/<reciterId>/<keyVersion>/001.m4a` twice: `200`, `content-type: audio/mp4`, and `cf-cache-status: HIT` on the second.
- [ ] **Step 6: Commit** — `Upload encoded recitations to R2`

---

### Task 6: Release

- [ ] **Step 1:** Open a PR with the new `programme.json` and timings. In the description: reciter, source, permission reference (not the letter itself), total duration of the khatm, `version`, and a reminder to set `PROGRAMME_VERSION=<version>` on Railway (M-E4) when merging.
- [ ] **Step 2:** After merge and deploy, open `/lab/audio` and check the highlighted ayah against the recitation at five random points (start of a surah, mid-surah, a long ayah, the last ayah of a surah, and across a surah boundary). If highlights are consistently early or late, set the converter's `offsetMs`, rebuild, and ship a new `version`. Then hand over to M-E8 and M-E9.

---

## Done when
- `pnpm --filter media test` passes; `pnpm data:validate` passes in production mode.
- All 114 files are on R2 and served from `tilawah-media.mxmd.dev` with cache hits.
- The site plays the real recitation with correct ayah highlighting.

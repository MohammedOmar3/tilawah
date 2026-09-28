# CLAUDE.md

Guidance for every Claude session and subagent working in this repository. Read this first, then the spec.

## What this is

Tilawah: everyone listens to the same Quran recitation at the same moment while a calm 3D globe shows where listeners are, in aggregate.

- Spec (source of truth): `docs/superpowers/specs/2026-09-27-quran-global-mvp-design.md`
- Features and acceptance checks: `docs/FEATURES.md`
- Plans, in execution order: `docs/superpowers/plans/` (start with `2026-09-27-00-roadmap.md`)
- Manual steps (accounts, credentials, devices): `docs/SETUP-MANUAL.md`. Never attempt these yourself; if a task seems to need one, stop and report.

## Hard constraints

1. **Hosting budget is $20/month total.** Railway bills outbound bytes. Anything identical for every listener (audio, text, timings, programme, presence snapshot) is served through Cloudflare, never pushed per-socket from Go. Before adding any server → client message, work out bytes × listeners × frequency.
2. **Audio never passes through Go.**
3. **Position is derived from the clock** (`offset = (now − epoch) mod total`). Never store or broadcast playback state or ayah changes. There is no global pause.
4. **Privacy:** never store IPs or raw coordinates; snap to the grid cell at `hello` and drop the raw value. Anonymous listeners are never geolocated. Enforce `K_MIN`.
5. **The Quran text is never edited by hand.** It is generated from `data/sources/` and checksummed.
6. **Collective, not social:** no likes, comments, profiles, chat, rankings, cookies or analytics SDKs.
7. **Calm UI:** no flashy animation; respect `prefers-reduced-motion`.

## Layout

```
packages/contracts   shared TS types, Zod schemas, fixtures/ (Go tests read these too)
apps/api             Go 1.24 service (chi, coder/websocket, slog)
apps/web             Next.js static export (App Router), Tailwind, three.js globe, Zustand
tools/quran-data     generates apps/web/public/data/* and dev audio
tools/loadtest       Go WebSocket load generator
tools/media          production audio ingest (plan 08, needs credentials)
data/sources         downloaded upstream data (Tanzil, Natural Earth), committed as-is
```

## Commands

```bash
pnpm install                         # all JS workspaces
pnpm -r typecheck && pnpm -r lint && pnpm -r test
pnpm --filter web dev                # http://localhost:3000
pnpm --filter web build              # static export to apps/web/out
pnpm --filter web e2e                # Playwright (starts API + web itself)
pnpm data:build                      # regenerate public/data from data/sources
pnpm data:dev                        # dev programme + generated test-tone audio

cd apps/api && go test ./... && go vet ./...
cd apps/api && go run ./cmd/server   # http://localhost:8080
```

## Conventions

- **TDD.** Write the failing test, watch it fail, implement, watch it pass, commit. One task = one commit, message in the imperative (`Add programme position calculator`).
- **Contracts first.** Any shape crossing a boundary (file, HTTP, WS) is defined in `packages/contracts` and in the spec §4. Changing one means updating the spec, the TS schema, the Go struct and the fixtures in the same commit.
- **Shared test vectors.** `packages/contracts/fixtures/programme-vectors.json` and friends are loaded by both Go and TS tests. Both must pass the same vectors.
- **Time in tests is injected.** Go code takes a `clock.Clock` (`Now() time.Time`); TS sync code takes a `now: () => number`. No real sleeps in unit tests.
- **Go:** standard library first; `internal/` packages; table-driven tests; `-race` in CI; errors wrapped with `%w`; no global state except `main`.
- **TS:** strict mode; no `any`; Zod-validate everything fetched; components in PascalCase files; pure logic in `lib/` with unit tests (Vitest), UI tested with Playwright.
- **Styling:** Tailwind; two calm palettes, Night (dark) and Fajr (light), defined as CSS variables in `app/globals.css`.
- **Dependencies:** don't add a dependency a plan doesn't name. If you think one is needed, stop and report instead.
- **Stay in your lane:** each plan lists the directories it owns. Don't edit files owned by another plan; report the need instead.

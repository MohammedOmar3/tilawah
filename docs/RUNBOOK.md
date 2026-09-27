# Runbook

How to deploy, check and fix Tilawah in production. The architecture is in the spec (§3); the one-time setup is `docs/SETUP-MANUAL.md` Part 2.

| Piece | Where | Config |
|---|---|---|
| API (`apps/api`) | Railway, one replica, `tilawah-api.mxmd.dev` behind Cloudflare | `railway.json`, `apps/api/Dockerfile`, Railway variables (spec §6) |
| Web (`apps/web`) | Cloudflare Pages project `tilawah`, `tilawah.mxmd.dev` | `.github/workflows/deploy-web.yml`, `apps/web/public/_headers`, GitHub variables |
| Audio | R2 bucket `quran-tilawah-media`, `tilawah-media.mxmd.dev` | Cache rule: edge TTL 1 year |

## Deploys

- **API:** merge to `main`. Railway builds `apps/api/Dockerfile` when anything under `apps/api/**` (or `railway.json`) changes, waits for `/healthz`, then stops the old container. On SIGTERM the server closes every socket with 1012; browsers reconnect with backoff and full jitter (1 s, 2 s, 4 s … 30 s), so the reconnect wave is spread out. **Audio keeps playing through the gap**, because position comes from the clock, not the server. Counts pause for a few seconds and recover within one snapshot interval.
- **Web:** merge to `main`. The `deploy-web` workflow builds the static export, fills the `MEDIA_HOST` and `API_HOST` variables into `_headers` and uploads to Pages. It can also be run by hand (Actions → deploy-web → Run workflow). It is skipped while the `API_HOST` variable is missing.
- Keep one replica. Presence lives in memory (spec D5); a second replica would split the counts.

## Rollback

- **Railway:** service → Deployments → pick the last good deployment → ⋯ → **Redeploy**. Then revert the bad commit on `main` so the next merge doesn't bring it back.
- **Pages:** Workers & Pages → `tilawah` → Deployments → last good deployment → ⋯ → **Rollback to this deployment**. Revert the commit afterwards.
- **Programme:** ship the previous `programme.json` under a new `version` (never reuse a version string) and set `PROGRAMME_VERSION` to it.

## Changing the programme

1. Build the new programme and timings with the plan 08 tooling (`tools/media`); never edit `programme.json` or the Quran text by hand.
2. Bump `version` (`YYYY-MM-DD.N`).
3. Open a PR; on merge, `deploy-web` publishes the new `/data/programme.json` (browser cache: 60 s).
4. Set `PROGRAMME_VERSION=<version>` on Railway (this redeploys the API). Clients whose `hello` carries an older version get a `programme` message after `welcome` and reload the programme.
5. Check `/lab/audio` at a few points (plan 08, Task 5).

## Health checks

- `curl https://tilawah-api.mxmd.dev/healthz` → `ok` (exempt from the origin secret).
- Through Cloudflare: `curl -s https://tilawah-api.mxmd.dev/v1/stats -H "Authorization: Bearer $STATS_TOKEN"` → connections, listeners, p50/p95 of `rttMs`, `|errMs|` and offset change over 10 minutes, Go memory. Healthy: p95 `absErrMs` < 250, `memory.sysBytes` well under 400 MB (313 MB at 5,000 sockets in the load test, most of it GC headroom). If memory approaches 400 MB, set `GOMEMLIMIT=320MiB` on Railway.
- `curl -sI https://tilawah-api.mxmd.dev/v1/presence.json` twice: the second says `cf-cache-status: HIT`.
- Cloudflare → Analytics → Cache: hit ratio for `tilawah-media.mxmd.dev` and `/v1/presence.json` should stay above 95 %. A low ratio means Railway (for presence) or R2 operations (for audio) are doing work Cloudflare should be absorbing.
- Railway → service → Metrics: memory flat, CPU low, network egress roughly linear in listeners.

## Cost checks

Budget: $20/month total. Load test projection (`tools/loadtest/RESULTS.md`): at 5,000 always-on listeners, egress $1.42 to $4.74/month and about $6 to $9 of Railway usage in total.

- **Weekly:** Railway → Usage → projected monthly cost. The hard usage limit is **$15** (set in M-E4), so the bill cannot pass $20 even in the worst case; at the limit Railway stops the service, and listeners keep hearing audio with frozen counts.
- **If the projection passes $12:**
  1. Raise `SNAPSHOT_INTERVAL` on Railway to `15s` (presence fetches from Cloudflare tiers drop by a third; S6 still holds at one interval plus cache).
  2. Raise the client re-sync interval (`RESYNC_EVERY_MS` in `apps/web/lib/sync/socket.ts`, 5 min today) to 10 min and redeploy the web app. This halves pongs and the ACKs for pings; the load test found per-connection costs (TLS handshake, join burst) and TCP ACKs for client messages dominate, so frequent reconnects matter more than any steady message.
  3. If still high, look at `/v1/stats` connections against the listener count you expect; a large gap points to clients reconnecting in a loop.
- Before adding any new server → client message, work out bytes × listeners × frequency (CLAUDE.md, hard constraint 1).

## Incidents

- **API down** (health check failing, Railway crash loop): audio keeps playing for everyone already listening, the ayah highlight keeps moving, counts freeze. New listeners see the current surah and ayah from static data; joining starts with a clock-sync burst over the socket (spec §5.1), so new joins are delayed until the API is back. Check Railway → Deployments → logs (JSON; `level=ERROR`), roll back if it started with a deploy. Restart policy retries 5 times.
- **All sockets rejected with 403:** the Cloudflare transform rule that adds `X-Origin-Auth` no longer matches `ORIGIN_SECRET`. Fix the rule or the variable, not both.
- **Counts stuck at 0 but connections present:** check that "Add visitor location headers" is still on and `TRUST_CF_HEADERS=true`; without locations listeners count but no cells show. Cells under `K_MIN` are hidden by design.
- **R2 / media down:** nothing to do but wait and watch Cloudflare status. Cached audio keeps working for most listeners.
- **Wrong ayah highlight:** audio is right but the highlight is consistently early or late → the timings offset is wrong. Fix `offsetMs` in the plan 08 converter, rebuild, ship a new programme `version`.
- **Listeners out of sync with each other:** check `/v1/stats` p95 `absErrMs` and `rttMs`. A high RTT everywhere points at Cloudflare or Railway region trouble, not the app.

## Privacy guarantees

What must never be logged, stored or sent anywhere (spec §2 and §6, CLAUDE.md constraint 4):

- IP addresses, raw or hashed, including `CF-Connecting-IP` and the TCP peer. The per-IP cap uses a salted hash kept only in memory; the salt rotates daily.
- Raw coordinates or city: `cf-iplatitude`, `cf-iplongitude`, `cf-ipcity`. They are read once at `hello`, snapped to the grid cell and dropped. Anonymous listeners are never located.
- Request headers in general, the `Origin` value in handshake errors, user agents, cookies (the site sets none).
- Any per-listener identifier in logs or `/v1/stats`; stats are aggregates only.

When debugging, raise `LOG_LEVEL=debug` temporarily; debug logs contain counts only. Never add a log line with request data, and never turn on Railway or Cloudflare features that log client IPs to a place we keep.

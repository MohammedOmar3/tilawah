# Manual Setup: Before and After the Automated Build

Everything that needs a human (accounts, credentials, permissions, real devices, judgement calls) is here. Nothing in the middle of the build needs you: plans 01 to 07 run end to end with subagents using only local tooling and a generated test tone for audio.

- **Part 1 (before):** about 30 minutes, plus sending one permission request that can take weeks to come back.
- **Part 2 (after):** about 2 to 3 hours, mostly clicking through Cloudflare and Railway.

Each step has an ID (`M-S*` for start, `M-E*` for end) that the plans refer to.

---

## Part 1: Before the build

### M-S1. Make `main` the base branch
The repository was empty when planning started. Create `main` from the planning branch's first commit (or merge the planning PR), and set `main` as the default branch in GitHub → Settings → General. The plans assume work lands on `main` through PRs.

### M-S2. Install Claude Code and Superpowers
```bash
# in Claude Code
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace
```
Restart Claude Code, then check `/help` lists the `superpowers:` skills. Plans are written for `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`.

### M-S3. Local toolchain (your machine, or the cloud environment's setup script)
| Tool | Version | Check |
|---|---|---|
| Node.js | 22 LTS | `node --version` |
| pnpm | 9 or later | `pnpm --version` (`corepack enable`) |
| Go | 1.24 or later | `go version` |
| Playwright browsers | matching `@playwright/test` | `pnpm --filter web exec playwright install chromium` |
| ffmpeg | any recent (only needed for plan 08) | `ffmpeg -version` |

### M-S4. Network access for agents
Agents need to reach `registry.npmjs.org`, `proxy.golang.org`, `sum.golang.org`, `tanzil.net` and `raw.githubusercontent.com`. If your environment blocks any of them, download these two data sources yourself and commit them to `data/sources/` before starting plan 02:

| File | Source | Save as |
|---|---|---|
| Uthmani Quran text, "Text (with aya numbers)" format | tanzil.net/download → Quran type: Uthmani; Output: Text with aya numbers; accept the terms | `data/sources/tanzil/quran-uthmani.txt` |
| Tanzil metadata | `https://tanzil.net/res/text/metadata/quran-data.xml` | `data/sources/tanzil/quran-data.xml` |
| Natural Earth 110m countries | `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson` | `data/sources/natural-earth/ne_110m_admin_0_countries.geojson` |

### M-S5. Ask for audio permission now (long lead time)
Pick a reciter whose **gapless per-surah recordings** and **verse timestamps** already exist (for example on Quran.com's chapter recitations), in **Hafs 'an 'Asim**. Write to the reciter or their publisher for written permission to stream the recordings from your own storage, stating that the project is non-commercial and ad-free. Plans 01 to 07 don't need the answer; plan 08 does.

### M-S6. (Optional now, required at the end) Register a domain
Any registrar works; Cloudflare Registrar is at cost. The plans write `<domain>` wherever it's needed.

---

## Part 2: After the build (launch)

Do these in order. Steps marked **agent-assisted** can be handed to Claude once the credential exists.

### M-E1. Cloudflare account and domain
1. Create a free Cloudflare account and add the domain; switch the registrar's nameservers to Cloudflare's.
2. SSL/TLS → Overview → **Full (strict)**.
3. Caching → Tiered Cache → turn on **Smart Tiered Caching** (free).

### M-E2. R2 bucket for audio
1. R2 → Create bucket `quran-global-media` (location: automatic).
2. Bucket → Settings → Custom domain → `media.<domain>`.
3. Bucket → Settings → CORS: allow `GET, HEAD` from `https://<domain>`.
4. Caching → Cache Rules → new rule: hostname equals `media.<domain>` → Eligible for cache, Edge TTL 1 year, Browser TTL 7 days.
5. R2 → Manage API tokens → create a token with **Object Read & Write** on this bucket. Keep the access key ID, secret and account ID for M-E3.

### M-E3. Ingest real audio (agent-assisted, runs plan 08)
Needs: the written permission from M-S5, the source recordings and verse timings, ffmpeg, and the R2 token from M-E2 exported as `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`. Plan 08 encodes, measures durations, builds the production `programme.json` and timings, and uploads to R2.

### M-E4. Railway service for the API
1. Railway → subscribe to **Hobby** ($5/month, includes $5 of usage).
2. New Project → Deploy from GitHub repo → `MohammedOmar3/tilawah`. Service settings: Root directory `/`, Dockerfile path `apps/api/Dockerfile`, watch paths `apps/api/**`, deploy branch `main`.
3. Variables:
   ```
   ALLOWED_ORIGINS=https://<domain>
   ORIGIN_SECRET=<long random string>        # also used in M-E5
   PROGRAMME_VERSION=<version from programme.json>
   STATS_TOKEN=<long random string>
   TRUST_CF_HEADERS=true
   ```
4. Settings → Networking → Custom domain `api.<domain>`; copy the CNAME target.
5. Settings → Usage limits → set a **hard limit of $15** so the bill can never pass $20.
6. Health check path: `/healthz`.

### M-E5. Cloudflare in front of the API
1. DNS: `api` CNAME → Railway target, **Proxied** (orange cloud). WebSockets are on by default; confirm under Network.
2. Rules → Transform Rules → Managed Transforms → turn on **Add visitor location headers**.
3. Rules → Transform Rules → Modify request header → hostname equals `api.<domain>` → Set static `X-Origin-Auth` = the `ORIGIN_SECRET` value.
4. Caching → Cache Rules → hostname equals `api.<domain>` AND URI path equals `/v1/presence.json` → Eligible for cache, Edge TTL **use cache-control header**.
5. Verify: `curl -sI https://api.<domain>/v1/presence.json` twice; the second shows `cf-cache-status: HIT`. `curl -sI https://<railway-host>/v1/presence.json` returns 403 (origin secret enforced).

### M-E6. Cloudflare Pages for the web app
1. Workers & Pages → Create → Pages → **Direct Upload** → project name `quran-global` (the GitHub Action uploads builds).
2. Custom domain: `<domain>` (and `www.<domain>` redirect if wanted).
3. My Profile → API Tokens → create a token with **Cloudflare Pages: Edit**.
4. GitHub repo → Settings → Secrets and variables → Actions:
   - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
   - Variables: `SITE_DOMAIN=<domain>`, `NEXT_PUBLIC_API_URL=https://api.<domain>`, `NEXT_PUBLIC_WS_URL=wss://api.<domain>/v1/ws` (the deploy workflow stays skipped until `SITE_DOMAIN` exists)
5. Push to `main` (or re-run the `deploy-web` workflow) and open `https://<domain>`.

### M-E7. Production load test (agent-assisted)
Run `tools/loadtest` against `api.<domain>` with 5,000 clients for 10 minutes (plan 07, task 6). Confirm S8 in the spec and watch Railway's memory graph. Delete nothing afterwards; the test leaves no state.

### M-E8. Real-device checks
Using `/lab/audio` and the main page:
- iPhone Safari: join, lock the screen for 2 minutes across a surah boundary, unlock. Audio should continue and resync.
- Android Chrome: same test.
- Two phones side by side on Wi-Fi: no audible echo.
- Bluetooth headphones: note the offset (expected, known limit).
- Reduced motion on, screen reader (VoiceOver) on.

### M-E9. Content and sensitivity review
Ask someone knowledgeable to check the Arabic text rendering, ayah markers, and the audio. Decide whether the ±2% playback-rate nudge is acceptable; if not, set `NEXT_PUBLIC_RATE_NUDGE_MAX=0` in the GitHub variables and redeploy.

### M-E10. Legal and attribution
- Keep the audio permission letter on file.
- Confirm the Quranic font's licence allows web embedding.
- Tanzil attribution is in the footer and `/privacy`; confirm it matches Tanzil's current terms.
- Have the privacy notice checked (IP processed momentarily for coarse location, nothing stored, no cookies).

### M-E11. After 48 hours live
Check Railway usage (projected monthly), Cloudflare cache hit ratio for `media.` and `/v1/presence.json` (expect > 95%), and `/v1/stats` p95 sync error (expect < 250 ms).

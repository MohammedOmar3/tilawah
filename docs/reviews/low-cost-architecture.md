# Quran Global: Hosting Design Under $20 a Month

Claude · 2026-09-27 · Follows on from the brief review in `quran-global-brief-review.md`.

**Target:** under $20 a month in total, comfortable at 5,000 concurrent listeners, with room to grow to roughly 20,000 or more before the budget is at risk.

**Result:** about **$6 to $10 a month** at 5,000 concurrent listeners.

## The rule behind the design

Railway charges for three things: CPU, RAM, and **data sent out** ($0.05/GB). Data sent *in* is free. Cloudflare charges nothing for bandwidth on its free plan or on R2.

So the design follows three rules:

1. Anything that is the same for every listener (audio, Quran text, timings, the globe) is served from Cloudflare's cache, never from Railway.
2. Railway only handles what is genuinely per-listener: clock sync and presence.
3. Listeners talk to Railway, and Railway barely talks back.

For scale: $10 of Railway traffic is 200 GB a month. Shared across 5,000 listeners around the clock, that's about **15 bytes per second per listener**. That's why pushing globe updates down every socket (the original brief) doesn't fit, and serving them from a cache does.

## Architecture

```
Browser
 ├─ Web app ───────────────► Cloudflare Pages (free)          static Next.js export
 ├─ Audio, text, timings ──► Cloudflare cache → R2 (free)     long-cached files
 ├─ Globe + counts ────────► Cloudflare cache (10–15 s) → Go  one origin fetch per interval
 └─ WebSocket ─────────────► Cloudflare proxy → Go on Railway clock sync + presence only
```

### What changes from the brief

| Brief | Low-cost design | Why |
|---|---|---|
| Next.js on Vercel | Next.js **static export on Cloudflare Pages** | Vercel's free plan is for non-commercial use and caps bandwidth at around 100 GB, which the globe assets alone could exceed. Pages is free with unmetered static bandwidth. Next.js, React, R3F and Tailwind all stay the same. |
| Postgres on Railway | **None for now.** Surahs, ayahs, timings and the programme are static JSON files on R2/Pages. | The data never changes at runtime. Saves $5 or more and removes a failure point. |
| Redis on Railway | **None for now.** A single Go instance keeps presence in memory. | Redis is only needed once there is more than one server instance. |
| Globe and presence events pushed over WebSocket | Go writes one small summary every 10 to 15 s. Clients fetch it through Cloudflare's cache. | Cloudflare delivers it to every listener for free. Railway sends it once per interval, not once per listener. |
| Audio from "object storage / CDN" | **R2 with a custom domain**, one file per surah, cached long-term at Cloudflare's edge | Free bandwidth. Whole-surah files keep download counts (R2's only per-use charge) tiny. 6-second HLS chunks would multiply them. |

### The Go service on Railway

Its only jobs:

- **Clock sync.** About 8 quick pings when someone joins, then one every few minutes.
- **Presence.** On connect, look up the IP to get a coarse area, then discard the IP. The client sends a small heartbeat every ~45 s, which is free inbound traffic and also keeps Cloudflare's 100-second idle timeout from closing the socket. The server doesn't reply to heartbeats.
- **Summary.** Every 10 to 15 s it builds the globe and count summary (a few KB compressed) and serves it at `/presence.json` with `Cache-Control: public, s-maxage=10`. With Cloudflare Tiered Cache turned on (free), only a handful of cache servers fetch it from Railway, instead of every one of Cloudflare's locations.
- **Programme changes.** Pushed over the WebSocket only when the programme itself changes, which is rare.

Playback position is still worked out from the clock and the programme, so a server restart or deploy doesn't interrupt the audio. Clients reconnect quietly in the background.

## Cost at 5,000 concurrent listeners (30 days, around the clock)

| Item | Estimate |
|---|---|
| Railway Hobby plan ($5 minimum, includes $5 of usage) | $5 |
| Go RAM, ~150 to 250 MB for 5k sockets at ~$10.37/GB | $1.50 to $2.50 (inside the $5) |
| Go CPU, ~0.05 to 0.1 vCPU average at ~$20.74/vCPU | $1 to $2 (inside the $5) |
| Railway data out (clock-sync replies, TCP acknowledgements, summary fetches), ~20 to 60 GB | $1 to $3 |
| Cloudflare Pages, proxy, cache, Tiered Cache | $0 |
| R2 (~1 GB of audio per reciter; bandwidth free; downloads mostly served from cache) | $0 |
| Domain name | ~$1 |
| **Total** | **about $6 to $10** |

## How far it stretches

The costs that grow with listeners are RAM (roughly 30 KB per socket) and a trickle of outbound traffic. At about 20,000 concurrent listeners the estimate reaches the mid-teens. Beyond that, the next step is to make the Go service leaner (smaller buffers, longer heartbeat interval) or move sockets to a second provider. A second instance also brings Redis back.

## Trade-offs you're accepting

- **Counts and the globe refresh every 10 to 15 seconds,** not instantly. Given the calm tone of the product, and the privacy advice to delay join pulses anyway, this is arguably better.
- **One server instance.** A deploy briefly disconnects everyone. Audio keeps playing, and clients reconnect with a random delay so they don't all return at once.
- **No database.** Changing the programme (for example adding Friday Al-Kahf) means editing a JSON file and redeploying until an admin tool is worth building.
- **Whole-surah audio files instead of HLS chunks.** Transitions between surahs may have a short gap, and iPhone lock-screen behaviour must be tested early. HLS stays an option if long cache lifetimes keep the chunk downloads mostly cached.

## Things to verify before building

- Current Cloudflare terms on serving audio through the CDN. Serving from R2 is Cloudflare's intended route for this, but check the current wording.
- Railway Hobby plan limits for a public production service.
- Measured memory per WebSocket in the chosen Go library, using a quick load test with 5,000 fake clients.

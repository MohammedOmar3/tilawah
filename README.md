# Tilawah (Tilawah)

> One Quran. One moment. A world listening together.

A web app where everyone hears the same Quran recitation at the same moment, sees the surah and ayah being recited, and sees a calm 3D globe of where people are listening, in aggregate. Collective, not social. Hosting budget: $20/month.

## Status

Planning complete; implementation not started. Start here:

| Document | What it is |
|---|---|
| [`docs/superpowers/plans/2026-09-27-00-roadmap.md`](docs/superpowers/plans/2026-09-27-00-roadmap.md) | Execution order, parallel waves, how to run the plans with Superpowers subagents |
| [`docs/SETUP-MANUAL.md`](docs/SETUP-MANUAL.md) | Every manual step, grouped before and after the automated build |
| [`docs/superpowers/specs/2026-09-27-quran-global-mvp-design.md`](docs/superpowers/specs/2026-09-27-quran-global-mvp-design.md) | Design spec: architecture, data contracts, decisions |
| [`docs/FEATURES.md`](docs/FEATURES.md) | Feature list with acceptance checks |
| [`CLAUDE.md`](CLAUDE.md) | Conventions every agent follows |
| [`docs/reviews/`](docs/reviews/) | The brief review and the low-cost hosting design this plan builds on |

## Architecture in one picture

```
Browser
 ├─ Web app ─────────────► Cloudflare Pages (free)        static Next.js export
 ├─ Audio ───────────────► Cloudflare cache → R2 (free egress)
 ├─ presence.json ───────► Cloudflare cache (10 s) → Go on Railway
 └─ WebSocket ───────────► Cloudflare proxy → Go on Railway (clock sync + presence only)
```

Estimated cost: about $6 to $10 a month at 5,000 concurrent listeners.

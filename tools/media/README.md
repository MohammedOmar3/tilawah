# tools/media

Production audio ingest. Needs `ffmpeg`/`ffprobe` on the path and, for `upload`, the `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET` environment variables. `input/` and `output/` are git-ignored.

```bash
pnpm --filter media fetch 7 alafasy "Mishary Rashid Alafasy"  # Quran.com recitation 7 → input/alafasy/{audio,timings}
pnpm --filter media encode alafasy                   # → output/alafasy/NNN.m4a (mono AAC 64k) + durations.json
pnpm --filter media upload alafasy v1                # → R2 alafasy/v1/NNN.m4a, immutable; skips files already there
pnpm --filter media build-programme alafasy https://tilawah-media.mxmd.dev v1 2026-09-28 [offsetMs]
pnpm data:validate                                   # then open a PR
```

Uploaded keys are never overwritten or deleted: new audio gets a new key version (`v2`), and a new programme gets a new `version`. See `docs/RUNBOOK.md` → Changing the programme.

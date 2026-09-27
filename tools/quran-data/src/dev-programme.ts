import { Programme, Surahs } from "@tilawah/contracts";
import type { Track } from "@tilawah/contracts";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEV_RECITER_ID, devTimings } from "./lib/dev-timings";
import { encodeWav, synthTrack } from "./lib/wav";
import { devAudioDir, webDataDir } from "./paths";

const SAMPLE_RATE = 16000;
const TRACKS = [
  { surah: 1, durationMs: 60000, intro: false },
  { surah: 112, durationMs: 45000, intro: true },
  { surah: 113, durationMs: 30000, intro: true },
];

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

async function main(): Promise<void> {
  const surahs = Surahs.parse(JSON.parse(readFileSync(path.join(webDataDir, "surahs.json"), "utf8")));
  const timingsDir = path.join(webDataDir, "timings", DEV_RECITER_ID);
  await mkdir(timingsDir, { recursive: true });
  await mkdir(devAudioDir, { recursive: true });

  const tracks: Track[] = [];
  for (const { surah, durationMs, intro } of TRACKS) {
    const meta = surahs.find((s) => s.number === surah);
    if (!meta) throw new Error(`surah ${surah} not in surahs.json`);
    const timings = devTimings({ surah, ayahCount: meta.ayahCount, durationMs, intro });

    const samples = synthTrack({
      durationMs,
      sampleRate: SAMPLE_RATE,
      beepAtMs: timings.segments.map((s) => s.startMs),
    });
    if (durationMs * (SAMPLE_RATE / 1000) !== samples.length) {
      throw new Error(`surah ${surah}: ${samples.length} samples for ${durationMs} ms`);
    }

    const name = pad3(surah);
    await writeFile(path.join(devAudioDir, `${name}.wav`), encodeWav(samples, SAMPLE_RATE));
    await writeFile(path.join(timingsDir, `${name}.json`), JSON.stringify(timings, null, 2) + "\n");
    tracks.push({
      surah,
      durationMs,
      audio: `/dev-audio/${name}.wav`,
      timings: `/data/timings/${DEV_RECITER_ID}/${name}.json`,
    });
  }

  const programme = Programme.parse({
    version: "dev.1",
    epoch: "2026-09-01T00:00:00Z",
    reciter: { id: DEV_RECITER_ID, name: "Development tone", riwayah: "hafs" },
    tracks,
  });
  const json = JSON.stringify(programme, null, 2) + "\n";
  await writeFile(path.join(webDataDir, "programme.dev.json"), json);
  // programme.json is the live programme; only overwrite it while it is still the dev one.
  const livePath = path.join(webDataDir, "programme.json");
  const live = existsSync(livePath) ? (JSON.parse(readFileSync(livePath, "utf8")) as { reciter?: { id?: string } }) : null;
  const replaceLive = live === null || live.reciter?.id === DEV_RECITER_ID;
  if (replaceLive) await writeFile(livePath, json);
  const files = replaceLive ? "programme.dev.json, programme.json" : "programme.dev.json (kept the production programme.json)";
  console.log(`wrote ${files}, ${tracks.length} timings and ${tracks.length} WAVs`);
}

await main();

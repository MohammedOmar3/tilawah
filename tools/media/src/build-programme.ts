// Converts timings, writes apps/web/public/data/timings/<reciterId>/ and programme.json.
// Usage: pnpm --filter media build-programme <reciterId> <mediaBase> <keyVersion> <launch YYYY-MM-DD> [offsetMs]
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildProgramme, clampTimings } from "./programme";
import { convertQuranComTimings, type QuranComRecitation } from "./timings";
import { inputDir, outputDir, pad3, webDataDir } from "./paths";

const [reciterId, mediaBase, keyVersion, launch, offset] = process.argv.slice(2);
if (!reciterId || !mediaBase || !keyVersion || !launch || !/^\d{4}-\d{2}-\d{2}$/.test(launch)) {
  console.error("usage: build-programme <reciterId> <mediaBase> <keyVersion> <launch YYYY-MM-DD> [offsetMs]");
  process.exit(2);
}
const offsetMs = offset ? Number(offset) : 0;
const readJson = (file: string): unknown => JSON.parse(readFileSync(file, "utf8"));

const reciter = readJson(path.join(inputDir(reciterId), "reciter.json")) as { id: string; name: string; riwayah: string };
const durations = readJson(path.join(outputDir(reciterId), "durations.json")) as Record<string, number>;

const timingsDir = path.join(webDataDir, "timings", reciterId);
rmSync(timingsDir, { recursive: true, force: true });
mkdirSync(timingsDir, { recursive: true });
for (let s = 1; s <= 114; s++) {
  const n = pad3(s);
  const src = readJson(path.join(inputDir(reciterId), "timings", `${n}.json`)) as QuranComRecitation;
  const converted = convertQuranComTimings(src, reciterId, { offsetMs });
  const { timings, clampedMs } = clampTimings(converted, durations[n]!);
  if (clampedMs > 0) console.log(`surah ${n}: clamped last ayah by ${clampedMs} ms`);
  writeFileSync(path.join(timingsDir, `${n}.json`), JSON.stringify(timings) + "\n");
}

const programme = buildProgramme({
  reciter,
  durations,
  mediaBase: mediaBase.replace(/\/$/, ""),
  keyVersion,
  epoch: `${launch}T00:00:00Z`,
  version: `${launch}.1`,
});
writeFileSync(path.join(webDataDir, "programme.json"), JSON.stringify(programme, null, 2) + "\n");
const totalMs = programme.tracks.reduce((a, t) => a + t.durationMs, 0);
console.log(`programme ${programme.version}: 114 tracks, khatm ${(totalMs / 3_600_000).toFixed(2)} h`);

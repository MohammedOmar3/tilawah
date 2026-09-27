import { Programme, Surahs, Timings } from "@tilawah/contracts";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DEV_RECITER_ID } from "./lib/dev-timings";
import { validateProgramme } from "./lib/validate";
import { webDataDir } from "./paths";

const publicDir = path.dirname(webDataDir);

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
}

function main(): void {
  const errors: string[] = [];
  const programme = Programme.parse(readJson(path.join(webDataDir, "programme.json")));
  const surahs = Surahs.parse(readJson(path.join(webDataDir, "surahs.json")));

  const timingsBySurah = new Map<number, Timings>();
  for (const track of programme.tracks) {
    if (!track.timings.startsWith("/")) {
      errors.push(`surah ${track.surah}: timings path ${track.timings} must be root-relative`);
      continue;
    }
    const file = path.join(publicDir, track.timings);
    try {
      timingsBySurah.set(track.surah, Timings.parse(readJson(file)));
    } catch (err) {
      errors.push(`surah ${track.surah}: cannot load ${track.timings}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const production = programme.reciter.id !== DEV_RECITER_ID;
  errors.push(...validateProgramme(programme, surahs, timingsBySurah, { production }));

  if (errors.length > 0) {
    for (const e of errors) console.error(e);
    process.exit(1);
  }
  console.log(`programme ${programme.version} (${production ? "production" : "dev"}): ${programme.tracks.length} tracks, no errors`);
}

main();

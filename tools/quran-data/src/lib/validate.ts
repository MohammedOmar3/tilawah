import type { Programme, Surah, Timings } from "@tilawah/contracts";

export interface ValidateOptions {
  /** Production programmes must be a full khatm: surahs 1 to 114 in order. */
  production?: boolean;
}

/**
 * Cross-check a programme against surah metadata and its timings files.
 * `timingsBySurah` is keyed by the track's surah number. Returns a list of errors.
 */
export function validateProgramme(
  programme: Programme,
  surahs: readonly Surah[],
  timingsBySurah: ReadonlyMap<number, Timings>,
  { production = false }: ValidateOptions = {},
): string[] {
  const errors: string[] = [];
  const bySurah = new Map(surahs.map((s) => [s.number, s]));

  programme.tracks.forEach((track, i) => {
    const where = `track ${i} (surah ${track.surah})`;
    const meta = bySurah.get(track.surah);
    if (!meta) {
      errors.push(`${where}: surah not in surahs.json`);
      return;
    }
    const timings = timingsBySurah.get(track.surah);
    if (!timings) {
      errors.push(`${where}: no timings loaded from ${track.timings}`);
      return;
    }
    if (timings.surah !== track.surah) {
      errors.push(`${where}: timings file ${track.timings} is for surah ${timings.surah}`);
    }
    for (const seg of timings.segments) {
      if (seg.ayah > meta.ayahCount) {
        errors.push(`${where}: segment ayah ${seg.ayah} exceeds ayahCount ${meta.ayahCount}`);
      }
    }
    const last = timings.segments.at(-1);
    if (last && last.endMs > track.durationMs) {
      errors.push(`${where}: last segment ends at ${last.endMs} ms, after durationMs ${track.durationMs}`);
    }
  });

  if (production) {
    const order = programme.tracks.map((t) => t.surah);
    const full = order.length === 114 && order.every((s, i) => s === i + 1);
    if (!full) errors.push("production programme must cover surahs 1 to 114 in order");
  }
  return errors;
}

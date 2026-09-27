import { Programme, Timings } from "@tilawah/contracts";
import { pad3 } from "./paths";

export interface BuildProgrammeInput {
  reciter: Programme["reciter"];
  /** durationMs by zero-padded surah number ("001"). */
  durations: Record<string, number>;
  /** Absolute origin of the media host, without a trailing slash. */
  mediaBase: string;
  /** Immutable key prefix, bumped whenever the audio changes. */
  keyVersion: string;
  epoch: string;
  version: string;
}

export function buildProgramme(i: BuildProgrammeInput): Programme {
  if (!/^\d{4}-\d{2}-\d{2}\.\d+$/.test(i.version)) throw new Error(`version ${i.version} must look like YYYY-MM-DD.N`);
  const tracks = Array.from({ length: 114 }, (_, k) => {
    const surah = k + 1;
    const n = pad3(surah);
    const durationMs = i.durations[n];
    if (durationMs === undefined) throw new Error(`no duration for surah ${n}`);
    return {
      surah,
      durationMs,
      audio: `${i.mediaBase}/${i.reciter.id}/${i.keyVersion}/${n}.m4a`,
      timings: `/data/timings/${i.reciter.id}/${n}.json`,
    };
  });
  return Programme.parse({ version: i.version, epoch: i.epoch, reciter: i.reciter, tracks });
}

/**
 * Source timings can end past the audio: encoding trims a few tens of ms, and some
 * Quran.com timings overrun their own MP3 (14:52 by 2.9 s). End the last ayah at the
 * audio's end, unless that would cut it by more than half, which means the timings
 * don't belong to this file.
 */
export function clampTimings(t: Timings, durationMs: number): { timings: Timings; clampedMs: number } {
  const last = t.segments.at(-1)!;
  const over = last.endMs - durationMs;
  if (over <= 0) return { timings: t, clampedMs: 0 };
  if (over * 2 > last.endMs - last.startMs) {
    throw new Error(`surah ${t.surah}: timings run ${over} ms past the audio, more than half the last ayah`);
  }
  const segments = [...t.segments.slice(0, -1), { ...last, endMs: durationMs }];
  return { timings: Timings.parse({ ...t, segments }), clampedMs: over };
}

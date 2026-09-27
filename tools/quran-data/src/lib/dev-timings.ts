import { Timings } from "@tilawah/contracts";
import type { TimingSegment } from "@tilawah/contracts";

export const DEV_RECITER_ID = "dev-tone";
export const INTRO_MS = 3000;
export const GAP_MS = 300;

export interface DevTimingsOptions {
  surah: number;
  ayahCount: number;
  durationMs: number;
  intro: boolean;
}

/**
 * Evenly spaced development timings: an optional 3 s unnumbered intro (ayah 0),
 * then every ayah gets an equal slot, each followed by a 300 ms gap except the
 * last, which ends exactly at `durationMs`.
 */
export function devTimings({ surah, ayahCount, durationMs, intro }: DevTimingsOptions): Timings {
  const segments: TimingSegment[] = [];
  const base = intro ? INTRO_MS : 0;
  if (intro) segments.push({ ayah: 0, startMs: 0, endMs: INTRO_MS });

  const slot = Math.floor((durationMs - base) / ayahCount);
  if (slot <= GAP_MS) throw new Error(`surah ${surah}: ${durationMs} ms is too short for ${ayahCount} ayahs`);

  for (let i = 0; i < ayahCount; i++) {
    const startMs = base + i * slot;
    const endMs = i === ayahCount - 1 ? durationMs : startMs + slot - GAP_MS;
    segments.push({ ayah: i + 1, startMs, endMs });
  }
  return Timings.parse({ surah, reciter: DEV_RECITER_ID, segments });
}

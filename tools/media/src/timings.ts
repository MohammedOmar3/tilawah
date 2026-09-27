import { Timings } from "@tilawah/contracts";

/** Quran.com chapter recitation (`/chapter_recitations/{id}/{surah}?segments=true`). */
export interface QuranComRecitation {
  audio_file: {
    chapter_id: number;
    timestamps: { verse_key: string; timestamp_from: number; timestamp_to: number }[];
  };
}

export interface ConvertOptions {
  /** Shifts every boundary to correct encoder delay; results are clamped at 0. */
  offsetMs?: number;
}

/** A lead-in (isti'adhah, basmala) longer than this becomes an ayah 0 segment. */
const LEAD_IN_MS = 1000;

export function convertQuranComTimings(src: QuranComRecitation, reciter: string, { offsetMs = 0 }: ConvertOptions = {}): Timings {
  const surah = src.audio_file.chapter_id;
  const shift = (ms: number) => Math.max(0, Math.round(ms + offsetMs));
  const segments: Timings["segments"] = [];

  src.audio_file.timestamps.forEach((ts, i) => {
    const [s, a] = ts.verse_key.split(":").map(Number);
    if (s !== surah) throw new Error(`verse ${ts.verse_key} is not in surah ${surah}`);
    if (a !== i + 1) throw new Error(`surah ${surah}: expected ayah ${i + 1}, got ${ts.verse_key}`);
    const prevEnd = segments.at(-1)?.endMs ?? 0;
    // Upstream data has rare overlaps (60:11/60:12); the earlier verse keeps its end.
    segments.push({ ayah: a, startMs: Math.max(shift(ts.timestamp_from), prevEnd), endMs: shift(ts.timestamp_to) });
  });

  const first = segments[0];
  if (first && first.startMs > LEAD_IN_MS) {
    segments.unshift({ ayah: 0, startMs: 0, endMs: first.startMs });
  }
  return Timings.parse({ surah, reciter, segments });
}

import { positionAt, type CompiledProgramme } from "@tilawah/contracts";
import { formatCount } from "./format";

/** What the shared recitation has covered since the programme began. Derived from the clock, never stored. */
export interface RecitedTotals {
  /** Time recited since the programme epoch. */
  recitedMs: number;
  /** Surahs recited to the end. */
  surahs: number;
  /** Complete recitations of the Quran, Al-Fatiha to An-Nas. */
  khatms: number;
}

export function recitedTotals(c: CompiledProgramme, nowMs: number): RecitedTotals {
  if (nowMs <= c.epochMs) return { recitedMs: 0, surahs: 0, khatms: 0 };
  const p = positionAt(c, nowMs);
  return {
    recitedMs: nowMs - c.epochMs,
    surahs: p.loop * c.programme.tracks.length + p.trackIndex,
    khatms: p.loop,
  };
}

/** "45 minutes" under two hours, then "2 hours", "4,210 hours". */
export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  if (m < 120) return `${formatCount(m)} ${m === 1 ? "minute" : "minutes"}`;
  return `${formatCount(Math.floor(m / 60))} hours`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "28 Sep 2026": the day a total started counting, in UTC so every listener sees the same date. */
export function formatSince(iso: string | number): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

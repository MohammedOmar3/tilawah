/** Drift correction policy (spec §5.3). Pure: the audio engine applies the result. */

/** At normal speed, |err| up to this is treated as measurement noise. */
export const ENGAGE_ABOVE_MS = 100;
/** While correcting, return to normal speed once |err| is this small (or the error changes sign). */
export const RELEASE_BELOW_MS = 20;
/** |err| above this: hard seek. */
export const SEEK_ABOVE_MS = 1000;
/** After a stall, seek only if it left us further off than this; smaller gaps are corrected by rate. */
export const STALL_SEEK_ABOVE_MS = 250;
export const DEFAULT_RATE_MAX = 0.02;

export interface DriftInput {
  /** audio.currentTime·1000 − (target + outputLatency), smoothed; positive = audio ahead. */
  errMs: number;
  rateMax: number;
  /** The target position is in silence between segments (only used when rateMax = 0). */
  inGap: boolean;
  /** Playback just recovered from a stall (`waiting` → `playing`). */
  stalled: boolean;
  /** The element's current playbackRate. */
  rate: number;
}

export type DriftDecision = { kind: "hold"; rate: 1 } | { kind: "rate"; rate: number } | { kind: "seek" };

/**
 * Every rate change can be audible (a brief dropout on some browsers), so the
 * rate only ever takes three values and switches with hysteresis: engage at
 * ±ENGAGE_ABOVE_MS, run at a fixed ±rateMax until the error is back within
 * RELEASE_BELOW_MS, then return to 1.
 */
export function decide({ errMs, rateMax, inGap, stalled, rate }: DriftInput): DriftDecision {
  const abs = Math.abs(errMs);
  if (abs > SEEK_ABOVE_MS || (stalled && abs > STALL_SEEK_ABOVE_MS)) return { kind: "seek" };
  if (rateMax <= 0) return inGap && abs > ENGAGE_ABOVE_MS ? { kind: "seek" } : { kind: "hold", rate: 1 };
  if (rate !== 1) {
    const correcting = Math.sign(1 - rate); // +1: slowed down because the audio was ahead
    if (errMs * correcting > RELEASE_BELOW_MS) return { kind: "rate", rate };
    return { kind: "hold", rate: 1 };
  }
  if (abs <= ENGAGE_ABOVE_MS) return { kind: "hold", rate: 1 };
  return { kind: "rate", rate: 1 - Math.sign(errMs) * rateMax };
}

/** Median of a non-empty list. */
export function median(values: readonly number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

interface Span {
  startMs: number;
  endMs: number;
}

/** True when posMs is not inside any [startMs, endMs) segment. */
export function isInGap(segments: readonly Span[], posMs: number): boolean {
  let lo = 0;
  let hi = segments.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = segments[mid]!;
    if (posMs < s.startMs) hi = mid - 1;
    else if (posMs >= s.endMs) lo = mid + 1;
    else return false;
  }
  return true;
}

/** The first silence that contains posMs or starts after it; the tail after the last segment has endMs = Infinity. */
export function nextGap(segments: readonly Span[], posMs: number): Span {
  let prevEnd = 0;
  for (const s of segments) {
    if (s.startMs > prevEnd && s.startMs > posMs) return { startMs: prevEnd, endMs: s.startMs };
    prevEnd = Math.max(prevEnd, s.endMs);
  }
  return { startMs: prevEnd, endMs: Infinity };
}

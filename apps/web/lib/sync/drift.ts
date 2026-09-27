/** Drift correction policy (spec §5.3). Pure: the audio engine applies the result. */

/** |err| below this: play at normal speed. */
export const HOLD_BELOW_MS = 40;
/** |err| above this: hard seek. */
export const SEEK_ABOVE_MS = 1000;
/** err / RATE_DIVISOR is the rate nudge before clamping. */
export const RATE_DIVISOR = 4000;
export const DEFAULT_RATE_MAX = 0.02;

export interface DriftInput {
  /** audio.currentTime·1000 − (target + outputLatency); positive = audio ahead. */
  errMs: number;
  rateMax: number;
  /** The target position is in silence between segments (only used when rateMax = 0). */
  inGap: boolean;
  /** Playback just recovered from a stall (`waiting` → `playing`). */
  stalled: boolean;
}

export type DriftDecision = { kind: "hold"; rate: 1 } | { kind: "rate"; rate: number } | { kind: "seek" };

export function decide({ errMs, rateMax, inGap, stalled }: DriftInput): DriftDecision {
  const abs = Math.abs(errMs);
  if (stalled || abs > SEEK_ABOVE_MS) return { kind: "seek" };
  if (abs < HOLD_BELOW_MS) return { kind: "hold", rate: 1 };
  if (rateMax <= 0) return inGap ? { kind: "seek" } : { kind: "hold", rate: 1 };
  const nudge = Math.min(rateMax, Math.max(-rateMax, errMs / RATE_DIVISOR));
  return { kind: "rate", rate: 1 - nudge };
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

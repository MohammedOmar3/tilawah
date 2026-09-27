import type { Programme, TimingSegment } from "./schemas";

export interface CompiledProgramme {
  programme: Programme;
  epochMs: number;
  totalMs: number;
  /** prefix[i] = start offset of track i; prefix[tracks.length] = totalMs */
  prefix: number[];
}

export interface Position {
  trackIndex: number;
  posInTrackMs: number;
  offsetMs: number;
  loop: number;
  msToNextTrack: number;
}

export function compileProgramme(programme: Programme): CompiledProgramme {
  const prefix = [0];
  for (const t of programme.tracks) prefix.push(prefix[prefix.length - 1]! + t.durationMs);
  return { programme, epochMs: Date.parse(programme.epoch), totalMs: prefix[prefix.length - 1]!, prefix };
}

export function positionAt(c: CompiledProgramme, nowMs: number): Position {
  const elapsed = nowMs - c.epochMs;
  const offsetMs = ((elapsed % c.totalMs) + c.totalMs) % c.totalMs;
  const loop = Math.floor(elapsed / c.totalMs);
  // Largest i with prefix[i] <= offset (binary search over track starts).
  let lo = 0;
  let hi = c.prefix.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (c.prefix[mid]! <= offsetMs) lo = mid;
    else hi = mid - 1;
  }
  const posInTrackMs = offsetMs - c.prefix[lo]!;
  return { trackIndex: lo, posInTrackMs, offsetMs, loop, msToNextTrack: c.prefix[lo + 1]! - offsetMs };
}

/** Ayah being recited at posMs. Gaps keep the previous ayah; before the first segment returns 0. */
export function ayahAt(segments: readonly TimingSegment[], posMs: number): number {
  let lo = 0;
  let hi = segments.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid]!.startMs <= posMs) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found === -1 ? 0 : segments[found]!.ayah;
}

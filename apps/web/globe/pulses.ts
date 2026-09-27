import type { PresenceCell } from "@tilawah/contracts";

/** A ring to start at `atMs` after the snapshot arrived. */
export interface Pulse {
  lat: number;
  lng: number;
  atMs: number;
}

export interface PulseOptions {
  /** The snapshot interval to spread pulses across. */
  intervalMs: number;
  /** At most this many pulses per snapshot; the largest joins win. */
  maxPulses?: number;
  reducedMotion: boolean;
  /** Returns a number in [0, 1). Injected so tests are deterministic. */
  random?: () => number;
}

export const DEFAULT_MAX_PULSES = 24;
/** Two pulses in the same cell are never closer together than this. */
export const MIN_SAME_CELL_GAP_MS = 2000;

const cellKey = (c: { lat: number; lng: number }) => `${c.lat},${c.lng}`;

/**
 * Spread a snapshot's joins as calm pulses across the next interval: one pulse
 * per join (not per listener), at `random() × intervalMs`, sorted by time.
 */
export function schedulePulses(joins: readonly PresenceCell[], options: PulseOptions): Pulse[] {
  const { intervalMs, maxPulses = DEFAULT_MAX_PULSES, reducedMotion, random = Math.random } = options;
  if (reducedMotion || maxPulses <= 0) return [];

  const kept = joins
    .filter((j) => j.n > 0)
    .map((j, i) => ({ j, i }))
    // Largest first; ties keep their input order.
    .sort((a, b) => b.j.n - a.j.n || a.i - b.i)
    .slice(0, maxPulses)
    .map(({ j }) => j);

  const byCell = new Map<string, number[]>();
  const pulses: Pulse[] = [];
  for (const j of kept) {
    const atMs = random() * intervalMs;
    const key = cellKey(j);
    const times = byCell.get(key) ?? [];
    if (times.some((t) => Math.abs(t - atMs) < MIN_SAME_CELL_GAP_MS)) continue;
    times.push(atMs);
    byCell.set(key, times);
    pulses.push({ lat: j.lat, lng: j.lng, atMs });
  }
  return pulses.sort((a, b) => a.atMs - b.atMs);
}

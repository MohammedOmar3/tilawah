import type { PresenceCell } from "@tilawah/contracts";

/** A hexbin input point: one presence cell, weighted by its listener count. */
export interface GlobePoint {
  lat: number;
  lng: number;
  weight: number;
}

/** Presence cells → hexbin points, largest first so the order is stable. */
export function cellsToPoints(cells: readonly PresenceCell[]): GlobePoint[] {
  return cells
    .map((c) => ({ lat: c.lat, lng: c.lng, weight: c.n }))
    .sort((a, b) => b.weight - a.weight);
}

const MAX_HEIGHT = 0.25;

/** Hexbin altitude (in globe radii) for `n` listeners: 0.02 + 0.04 × log10(n), capped. */
export function heightFor(n: number): number {
  return Math.min(MAX_HEIGHT, 0.02 + 0.04 * Math.log10(Math.max(1, n)));
}

type Rgba = readonly [number, number, number, number];
const DIM: Rgba = [212, 175, 107, 0.35];
const BRIGHT: Rgba = [245, 222, 170, 0.95];

/** Linear interpolation from the dim to the bright gold, `t` clamped to [0, 1]. */
export function colourFor(t: number): string {
  const k = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  const mix = (i: 0 | 1 | 2 | 3) => DIM[i] + (BRIGHT[i] - DIM[i]) * k;
  const r = Math.round(mix(0));
  const g = Math.round(mix(1));
  const b = Math.round(mix(2));
  const a = Math.round(mix(3) * 100) / 100;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Colour for a bin of `n` listeners when the largest bin has `maxN`: t = log(n) / log(maxN). */
export function colourForWeight(n: number, maxN: number): string {
  if (maxN <= 1) return colourFor(1);
  return colourFor(Math.log(Math.max(1, n)) / Math.log(maxN));
}

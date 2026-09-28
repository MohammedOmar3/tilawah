import type { PresenceCell } from "@tilawah/contracts";

/** A listener region to draw: one presence cell, with its size relative to the busiest. */
export interface GlobePin {
  lat: number;
  lng: number;
  n: number;
  /** log(n) / log(max n), in [0, 1]; 1 when no cell has more than one listener. */
  weight: number;
}

/** Presence cells → pins, largest first so the order is stable. */
export function cellsToPins(cells: readonly PresenceCell[]): GlobePin[] {
  const maxN = cells.reduce((m, c) => Math.max(m, c.n), 1);
  return cells
    .map((c) => ({ lat: c.lat, lng: c.lng, n: c.n, weight: weightFor(c.n, maxN) }))
    .sort((a, b) => b.n - a.n);
}

/** t = log(n) / log(maxN), clamped to [0, 1]. */
export function weightFor(n: number, maxN: number): number {
  if (maxN <= 1) return 1;
  const t = Math.log(Math.max(1, n)) / Math.log(maxN);
  return Math.min(1, Math.max(0, t));
}

/** Pin height as a fraction of the globe radius: small regions stay visible, busy ones stand out. */
export function pinSize(weight: number): number {
  return 0.046 + 0.026 * Math.min(1, Math.max(0, weight));
}

/** A point on the unit sphere (y up, lng 0 facing +z), scaled to radius `r`. */
export function latLngToVector(lat: number, lng: number, r = 1): [number, number, number] {
  const la = (lat * Math.PI) / 180;
  const lo = (lng * Math.PI) / 180;
  return [r * Math.cos(la) * Math.sin(lo), r * Math.sin(la), r * Math.cos(la) * Math.cos(lo)];
}

/**
 * Camera distance (in globe radii) at which a unit sphere's silhouette has a
 * radius of `radiusPx` in a viewport `heightPx` tall, for a vertical fov in degrees.
 */
export function cameraDistance(radiusPx: number, heightPx: number, fovDeg: number): number {
  const f = Math.tan((fovDeg * Math.PI) / 360);
  return Math.sqrt(1 + (heightPx / (2 * Math.max(1, radiusPx) * f)) ** 2);
}

/** Where the globe sits in its container, in CSS pixels: centre and silhouette radius. */
export interface GlobeFrame {
  cx: number;
  cy: number;
  r: number;
}

/** The default frame: centred, filling 80% of the shorter side. */
export function centredFrame(width: number, height: number): GlobeFrame {
  return { cx: width / 2, cy: height / 2, r: Math.min(width, height) * 0.4 };
}

/**
 * Fraction of the remaining distance to cover in `dtMs` when easing towards a
 * new frame (the zoom on join). Frame-rate independent; 1 under reduced motion.
 */
export function easeStep(dtMs: number, reducedMotion: boolean): number {
  if (reducedMotion) return 1;
  return 1 - Math.pow(0.0025, Math.max(0, dtMs) / 1000);
}

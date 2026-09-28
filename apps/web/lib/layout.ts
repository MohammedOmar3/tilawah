import type { GlobeFrame } from "@/globe";

/** At and above this width the join screen puts the globe left and the details right. */
export const WIDE_MIN_PX = 900;
/** The reading block may take at most this share of the height (phones, then wider screens). */
export const READING_MAX_SHARE = { narrow: 0.4, wide: 0.34 } as const;
/** Below this width the reading block counts as narrow. */
export const NARROW_MAX_PX = 600;

export interface Viewport {
  width: number;
  height: number;
}

/**
 * While listening: the globe fills the space between the reading block and the
 * dock, with its lower edge tucked under the dock. It grows when the reading
 * block is shorter (translation off, a short ayah).
 */
export function listeningFrame(v: Viewport, readingBottom: number, dockTop: number): GlobeFrame {
  const top = readingBottom + 14;
  const avail = Math.max(dockTop - 10 - top, 120);
  const r = Math.min(v.width * 0.66, avail * 0.7);
  return { cx: v.width / 2, cy: top + r * 1.1, r };
}

/**
 * Before joining. Wide screens: the globe fills the left half, bleeding a little
 * off the edge. Phones: the globe sits above the details, in the space they leave.
 */
export function joinFrame(v: Viewport, detailsTop: number): GlobeFrame {
  if (v.width >= WIDE_MIN_PX) {
    return { cx: v.width * 0.25, cy: v.height * 0.53, r: Math.min(v.width * 0.25, v.height * 0.42) };
  }
  const top = 62;
  const avail = Math.max(detailsTop - top, 160);
  return { cx: v.width / 2, cy: top + avail / 2, r: Math.min(v.width * 0.44, avail * 0.46) };
}

/** The tallest the reading block may be before its text shrinks. */
export function readingMaxHeight(v: Viewport): number {
  return v.height * (v.width < NARROW_MAX_PX ? READING_MAX_SHARE.narrow : READING_MAX_SHARE.wide);
}

/**
 * The largest scale (1, then down in `step`s, never below `min`) at which
 * `measure(scale)` fits within `max`. `measure` applies the scale and returns the
 * resulting height.
 */
export function fitScale(measure: (scale: number) => number, max: number, min = 0.5, step = 0.04): number {
  let scale = 1;
  while (measure(scale) > max && scale - step >= min - 1e-9) {
    scale = Math.round((scale - step) * 100) / 100;
  }
  return scale;
}

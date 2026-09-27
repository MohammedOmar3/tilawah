import { describe, expect, it } from "vitest";
import { MIN_SAME_CELL_GAP_MS, schedulePulses } from "./pulses";

/** A `random` that returns the given values in order, then repeats the last one. */
function sequence(...values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)] ?? 0;
}

const opts = { intervalMs: 10_000, reducedMotion: false };

describe("schedulePulses", () => {
  it("gives one pulse per join, not per listener", () => {
    const pulses = schedulePulses(
      [
        { lat: 25.5, lng: 55.5, n: 40 },
        { lat: -6.5, lng: 106.5, n: 1 },
      ],
      { ...opts, random: sequence(0.1, 0.2) },
    );
    expect(pulses).toHaveLength(2);
  });

  it("places each pulse at random() × intervalMs, deterministically", () => {
    const pulses = schedulePulses(
      [
        { lat: 25.5, lng: 55.5, n: 5 },
        { lat: -6.5, lng: 106.5, n: 3 },
        { lat: 52.5, lng: -0.5, n: 1 },
      ],
      { ...opts, random: sequence(0.5, 0.25, 0.75) },
    );
    expect(pulses).toEqual([
      { lat: -6.5, lng: 106.5, atMs: 2500 },
      { lat: 25.5, lng: 55.5, atMs: 5000 },
      { lat: 52.5, lng: -0.5, atMs: 7500 },
    ]);
  });

  it("keeps only the largest joins when there are more than maxPulses", () => {
    const joins = Array.from({ length: 30 }, (_, i) => ({ lat: i, lng: i, n: i + 1 }));
    const pulses = schedulePulses(joins, { ...opts, random: sequence(0.5) });
    expect(pulses).toHaveLength(24);
    const kept = new Set(pulses.map((p) => p.lat));
    for (let i = 6; i < 30; i++) expect(kept.has(i)).toBe(true);
    for (let i = 0; i < 6; i++) expect(kept.has(i)).toBe(false);
  });

  it("respects a custom maxPulses", () => {
    const joins = [
      { lat: 1, lng: 1, n: 1 },
      { lat: 2, lng: 2, n: 9 },
      { lat: 3, lng: 3, n: 5 },
    ];
    const pulses = schedulePulses(joins, { ...opts, maxPulses: 1, random: sequence(0) });
    expect(pulses).toEqual([{ lat: 2, lng: 2, atMs: 0 }]);
  });

  it("schedules nothing under reduced motion", () => {
    const pulses = schedulePulses([{ lat: 25.5, lng: 55.5, n: 3 }], {
      ...opts,
      reducedMotion: true,
      random: sequence(0.5),
    });
    expect(pulses).toEqual([]);
  });

  it("never puts two pulses in the same cell less than 2 s apart", () => {
    expect(MIN_SAME_CELL_GAP_MS).toBe(2000);
    const cell = { lat: 25.5, lng: 55.5 };
    const pulses = schedulePulses(
      [
        { ...cell, n: 9 },
        { ...cell, n: 8 },
        { ...cell, n: 7 },
        { lat: 0.5, lng: 0.5, n: 6 },
      ],
      // 1000 ms, 2500 ms (too close to 1000), 3000 ms (ok), 1100 ms (other cell)
      { ...opts, random: sequence(0.1, 0.25, 0.3, 0.11) },
    );
    expect(pulses).toEqual([
      { lat: 25.5, lng: 55.5, atMs: 1000 },
      { lat: 0.5, lng: 0.5, atMs: 1100 },
      { lat: 25.5, lng: 55.5, atMs: 3000 },
    ]);
  });

  it("ignores joins with n ≤ 0", () => {
    const pulses = schedulePulses([{ lat: 1, lng: 1, n: 0 }], { ...opts, random: sequence(0.5) });
    expect(pulses).toEqual([]);
  });
});

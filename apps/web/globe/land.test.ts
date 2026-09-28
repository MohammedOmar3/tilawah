import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LandDots } from "./land";

/** The dot nearest to (lat, lng), in degrees of plain lat/lng distance. */
function nearest(points: number[], lat: number, lng: number): number {
  let best = Infinity;
  for (let i = 0; i < points.length; i += 2) {
    best = Math.min(best, Math.hypot(points[i]! - lat, points[i + 1]! - lng));
  }
  return best;
}

describe("LandDots", () => {
  // Vitest runs with apps/web as its root.
  const dots = LandDots.parse(JSON.parse(readFileSync(resolve(process.cwd(), "public/globe/land-dots.json"), "utf8")));

  it("covers the land with about ten thousand dots", () => {
    expect(dots.points.length / 2).toBeGreaterThan(8000);
    expect(dots.points.length / 2).toBeLessThan(12000);
  });

  it("puts dots on land and none in the open ocean", () => {
    expect(nearest(dots.points, 21.4, 39.8)).toBeLessThan(1.5); // Makkah
    expect(nearest(dots.points, -6.2, 106.8)).toBeLessThan(1.5); // Jakarta
    expect(nearest(dots.points, 0, -140)).toBeGreaterThan(10); // central Pacific
    expect(nearest(dots.points, -30, -20)).toBeGreaterThan(10); // south Atlantic
  });

  it("rejects an odd number of coordinates", () => {
    expect(() => LandDots.parse({ v: 1, step: 1, points: [1, 2, 3] })).toThrow();
  });
});

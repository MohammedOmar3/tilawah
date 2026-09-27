import { describe, expect, it } from "vitest";
import presence from "@tilawah/contracts/fixtures/presence.example.json";
import { cellsToPoints, colourFor, colourForWeight, heightFor } from "./layers";

describe("cellsToPoints", () => {
  it("keeps lat/lng/weight and nothing else", () => {
    expect(cellsToPoints(presence.cells)[0]).toEqual({ lat: 25.5, lng: 55.5, weight: 481 });
  });

  it("orders points largest first and keeps every cell", () => {
    const points = cellsToPoints(presence.cells);
    expect(points).toHaveLength(presence.cells.length);
    expect(points.map((p) => p.weight)).toEqual([481, 300, 120]);
  });
});

describe("heightFor", () => {
  it("is monotonic and log-scaled, capped at 0.25", () => {
    expect(heightFor(5)).toBeLessThan(heightFor(50));
    expect(heightFor(50)).toBeLessThan(heightFor(5000));
    expect(heightFor(10_000_000)).toBeLessThanOrEqual(0.25);
    expect(heightFor(5)).toBeGreaterThan(0);
  });

  it("follows 0.02 + 0.04 × log10(n)", () => {
    expect(heightFor(100)).toBeCloseTo(0.1, 10);
  });
});

describe("colourFor", () => {
  it("interpolates from the dim to the bright palette colour", () => {
    expect(colourFor(0)).toBe("rgba(212, 175, 107, 0.35)");
    expect(colourFor(1)).toBe("rgba(245, 222, 170, 0.95)");
  });

  it("clamps t outside [0, 1]", () => {
    expect(colourFor(-1)).toBe(colourFor(0));
    expect(colourFor(2)).toBe(colourFor(1));
  });

  it("is halfway at t = 0.5", () => {
    expect(colourFor(0.5)).toBe("rgba(229, 199, 139, 0.65)");
  });
});

describe("colourForWeight", () => {
  it("uses t = log(n) / log(maxN)", () => {
    expect(colourForWeight(1000, 1000)).toBe(colourFor(1));
    expect(colourForWeight(1, 1000)).toBe(colourFor(0));
    expect(colourForWeight(10, 1000)).toBe(colourFor(1 / 3));
  });

  it("is bright when there is only one listener in total", () => {
    expect(colourForWeight(1, 1)).toBe(colourFor(1));
  });
});

import { describe, expect, it } from "vitest";
import presence from "@tilawah/contracts/fixtures/presence.example.json";
import { cameraDistance, cellsToPins, centredFrame, easeStep, latLngToVector, pinSize, weightFor } from "./layers";

describe("cellsToPins", () => {
  it("keeps lat/lng/n, adds a weight and orders largest first", () => {
    const pins = cellsToPins(presence.cells);
    expect(pins).toHaveLength(presence.cells.length);
    expect(pins.map((p) => p.n)).toEqual([481, 300, 120]);
    expect(pins[0]).toEqual({ lat: 25.5, lng: 55.5, n: 481, weight: 1 });
    expect(pins[2]!.weight).toBeCloseTo(Math.log(120) / Math.log(481), 10);
  });

  it("is empty for no cells", () => {
    expect(cellsToPins([])).toEqual([]);
  });
});

describe("weightFor", () => {
  it("uses t = log(n) / log(maxN)", () => {
    expect(weightFor(1000, 1000)).toBe(1);
    expect(weightFor(1, 1000)).toBe(0);
    expect(weightFor(10, 1000)).toBeCloseTo(1 / 3, 10);
  });

  it("is full when there is only one listener per cell", () => {
    expect(weightFor(1, 1)).toBe(1);
  });
});

describe("pinSize", () => {
  it("grows with weight within a calm range", () => {
    expect(pinSize(0)).toBeCloseTo(0.046, 10);
    expect(pinSize(1)).toBeCloseTo(0.072, 10);
    expect(pinSize(5)).toBe(pinSize(1));
  });
});

describe("latLngToVector", () => {
  it("puts lat 0, lng 0 on +z and the north pole on +y", () => {
    const [x, y, z] = latLngToVector(0, 0);
    expect([x, y, z].map((v) => Math.round(v * 1e9) / 1e9)).toEqual([0, 0, 1]);
    expect(latLngToVector(90, 0, 2)[1]).toBeCloseTo(2, 10);
    expect(latLngToVector(0, 90)[0]).toBeCloseTo(1, 10);
  });
});

describe("cameraDistance", () => {
  it("places the camera so the silhouette has the requested radius", () => {
    const fov = 30;
    const H = 800;
    const r = 200;
    const d = cameraDistance(r, H, fov);
    // The silhouette's angular radius is asin(1 / d); project it back to pixels.
    const px = (Math.tan(Math.asin(1 / d)) / Math.tan((fov * Math.PI) / 360)) * (H / 2);
    expect(px).toBeCloseTo(r, 6);
  });
});

describe("centredFrame", () => {
  it("centres the globe and fills 80% of the shorter side", () => {
    expect(centredFrame(1000, 500)).toEqual({ cx: 500, cy: 250, r: 200 });
  });
});

describe("easeStep", () => {
  it("jumps under reduced motion and eases otherwise, independent of frame rate", () => {
    expect(easeStep(16, true)).toBe(1);
    expect(easeStep(0, false)).toBe(0);
    const twoSmall = 1 - (1 - easeStep(20, false)) ** 2;
    expect(twoSmall).toBeCloseTo(easeStep(40, false), 10);
    expect(easeStep(2000, false)).toBeGreaterThan(0.99);
  });
});

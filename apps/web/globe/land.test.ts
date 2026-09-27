import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Land } from "./land";

describe("Land", () => {
  it("accepts the generated public/globe/land.json", () => {
    // Vitest runs with apps/web as its root.
    const path = resolve(process.cwd(), "public/globe/land.json");
    const land = Land.parse(JSON.parse(readFileSync(path, "utf8")));
    expect(land.features.length).toBeGreaterThan(170);

    // h3 rejects rings that collapse to repeated points after rounding.
    type Pos = [number, number];
    const rings = land.features.flatMap((f) =>
      f.geometry.type === "Polygon"
        ? (f.geometry.coordinates as Pos[][])
        : (f.geometry.coordinates as Pos[][][]).flat(),
    );
    for (const r of rings) {
      expect(r.length).toBeGreaterThanOrEqual(4);
      r.slice(1).forEach(([lng, lat], i) => expect([lng, lat]).not.toEqual(r[i]));
    }
  });

  it("rejects a file with properties-only features", () => {
    expect(() =>
      Land.parse({ type: "FeatureCollection", features: [{ type: "Feature", properties: {} }] }),
    ).toThrow();
  });
});

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
  });

  it("rejects a file with properties-only features", () => {
    expect(() =>
      Land.parse({ type: "FeatureCollection", features: [{ type: "Feature", properties: {} }] }),
    ).toThrow();
  });
});

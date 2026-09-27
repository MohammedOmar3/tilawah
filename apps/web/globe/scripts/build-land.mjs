// Derives apps/web/public/globe/land.json from the committed Natural Earth file.
// Keeps only each feature's geometry, drops all properties, rounds coordinates
// to 2 decimals. Plain Node, no dependencies.
//
//   node apps/web/globe/scripts/build-land.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const src = resolve(root, "data/sources/natural-earth/ne_110m_admin_0_countries.geojson");
const out = resolve(root, "apps/web/public/globe/land.json");

const round = (v) => Math.round(v * 100) / 100;
const roundCoords = (c) => (typeof c === "number" ? round(c) : c.map(roundCoords));

const input = JSON.parse(readFileSync(src, "utf8"));
const features = input.features
  .filter((f) => f.geometry)
  .map((f) => ({
    type: "Feature",
    geometry: { type: f.geometry.type, coordinates: roundCoords(f.geometry.coordinates) },
  }));

const json = JSON.stringify({ type: "FeatureCollection", features });
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, json);
console.log(`wrote ${out}: ${features.length} features, ${(json.length / 1024).toFixed(1)} KB`);

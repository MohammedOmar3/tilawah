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

// Rounding can collapse tiny islets into repeated points, which h3's
// polygonToCells (used by three-globe's hex layer) rejects. Drop repeated
// consecutive positions, then any ring left with fewer than 4 positions.
function ring(positions) {
  const out = [];
  for (const [lng, lat] of positions) {
    const p = [round(lng), round(lat)];
    const prev = out[out.length - 1];
    if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) out.push(p);
  }
  return out.length >= 4 ? out : null;
}

function polygon(rings) {
  const outer = ring(rings[0]);
  if (!outer) return null;
  return [outer, ...rings.slice(1).map(ring).filter(Boolean)];
}

function geometry(g) {
  if (g.type === "Polygon") {
    const p = polygon(g.coordinates);
    return p && { type: "Polygon", coordinates: p };
  }
  if (g.type === "MultiPolygon") {
    const ps = g.coordinates.map(polygon).filter(Boolean);
    return ps.length > 0 ? { type: "MultiPolygon", coordinates: ps } : null;
  }
  throw new Error(`unexpected geometry type ${g.type}`);
}

const input = JSON.parse(readFileSync(src, "utf8"));
const features = input.features
  .map((f) => f.geometry && geometry(f.geometry))
  .filter(Boolean)
  .map((g) => ({ type: "Feature", geometry: g }));

const json = JSON.stringify({ type: "FeatureCollection", features });
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, json);
console.log(`wrote ${out}: ${features.length} features, ${(json.length / 1024).toFixed(1)} KB`);

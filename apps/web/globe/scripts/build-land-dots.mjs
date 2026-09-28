// Derives apps/web/public/globe/land-dots.json from the committed Natural Earth
// file: an evenly spaced grid of points (about 1° apart) that fall on land,
// drawn by the globe as round dots. Plain Node, no dependencies.
//
//   node apps/web/globe/scripts/build-land-dots.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const src = resolve(root, "data/sources/natural-earth/ne_110m_admin_0_countries.geojson");
const out = resolve(root, "apps/web/public/globe/land-dots.json");

/** Degrees between neighbouring dots, along a meridian and along each parallel. */
const STEP = 1.05;
/** Antarctica is left out: it would ring the south pole with a dense white cap. */
const MIN_LAT = -60;

const round = (v) => Math.round(v * 100) / 100;

// Each polygon keeps its bounding box so most point tests are skipped cheaply.
const polygons = [];
for (const f of JSON.parse(readFileSync(src, "utf8")).features) {
  const g = f.geometry;
  if (!g) continue;
  const list = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  for (const rings of list) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of rings[0]) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    polygons.push({ rings, minX, minY, maxX, maxY });
  }
}

/** Even-odd ray casting against one ring. */
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function onLand(lng, lat) {
  for (const p of polygons) {
    if (lng < p.minX || lng > p.maxX || lat < p.minY || lat > p.maxY) continue;
    if (inRing(lng, lat, p.rings[0]) && !p.rings.slice(1).some((h) => inRing(lng, lat, h))) return true;
  }
  return false;
}

const points = [];
for (let lat = MIN_LAT; lat <= 84; lat += STEP) {
  // Fewer dots towards the poles, so the spacing on the sphere stays even.
  const n = Math.max(1, Math.round((360 * Math.cos((lat * Math.PI) / 180)) / STEP));
  for (let i = 0; i < n; i++) {
    const lng = -180 + (i + 0.5) * (360 / n);
    if (onLand(lng, lat)) points.push(round(lat), round(lng));
  }
}

const json = JSON.stringify({ v: 1, step: STEP, points });
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, json);
console.log(`wrote ${out}: ${points.length / 2} dots, ${(json.length / 1024).toFixed(1)} KB`);

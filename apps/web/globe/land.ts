import { z } from "zod";

/** `/globe/land.json`, as written by `scripts/build-land.mjs`. */
export const Land = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(
    z.object({
      type: z.literal("Feature"),
      geometry: z.object({
        type: z.enum(["Polygon", "MultiPolygon"]),
        coordinates: z.array(z.unknown()),
      }),
    }),
  ),
});
export type Land = z.infer<typeof Land>;

export const LAND_URL = "/globe/land.json";

let cached: Promise<Land> | null = null;

/** Fetches and validates the land outlines once per page load. */
export function loadLand(fetcher: typeof fetch = fetch): Promise<Land> {
  cached ??= fetcher(LAND_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`land.json: HTTP ${res.status}`);
      return res.json();
    })
    .then((json: unknown) => Land.parse(json))
    .catch((err: unknown) => {
      cached = null; // allow a retry on the next mount
      throw err;
    });
  return cached;
}

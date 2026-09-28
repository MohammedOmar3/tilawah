import { z } from "zod";

/** `/globe/land-dots.json`, as written by `scripts/build-land-dots.mjs`: flat `[lat, lng, lat, lng, …]`. */
export const LandDots = z.object({
  v: z.literal(1),
  step: z.number().positive(),
  points: z
    .array(z.number().min(-180).max(180))
    .refine((p) => p.length % 2 === 0, "points must be lat, lng pairs"),
});
export type LandDots = z.infer<typeof LandDots>;

export const LAND_DOTS_URL = "/globe/land-dots.json";

let cached: Promise<LandDots> | null = null;

/** Fetches and validates the land dots once per page load. */
export function loadLandDots(fetcher: typeof fetch = fetch): Promise<LandDots> {
  cached ??= fetcher(LAND_DOTS_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`land-dots.json: HTTP ${res.status}`);
      return res.json();
    })
    .then((json: unknown) => LandDots.parse(json))
    .catch((err: unknown) => {
      cached = null; // allow a retry on the next mount
      throw err;
    });
  return cached;
}

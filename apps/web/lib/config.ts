import { z } from "zod";

/** Unset and empty are the same thing for env vars. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === "" ? undefined : v), schema);

const EnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.url({ protocol: /^https?$/ }).transform((u) => u.replace(/\/+$/, "")),
  NEXT_PUBLIC_WS_URL: z.url({ protocol: /^wss?$/ }),
  NEXT_PUBLIC_PROGRAMME_URL: optional(z.string().min(1).default("/data/programme.json")),
  NEXT_PUBLIC_RATE_NUDGE_MAX: optional(z.coerce.number().min(0).max(0.05).default(0.02)),
  // A Tanzil-style id under /data/translations, or "off" for none.
  NEXT_PUBLIC_TRANSLATION_ID: optional(
    z
      .union([z.literal("off"), z.string().regex(/^[a-z]{2,3}\.[a-z0-9-]+$/)])
      .default("en.pickthall")
      .transform((v) => (v === "off" ? "" : v)),
  ),
  NEXT_PUBLIC_PRESENCE_POLL_MS: optional(z.coerce.number().int().min(1000).default(15000)),
  NEXT_PUBLIC_E2E: optional(
    z
      .enum(["0", "1", "true", "false"])
      .default("0")
      .transform((v) => v === "1" || v === "true"),
  ),
});

export type Env = Partial<Record<keyof z.input<typeof EnvSchema>, string | undefined>>;

export interface Config {
  apiUrl: string;
  wsUrl: string;
  programmeUrl: string;
  rateNudgeMax: number;
  /** The translation shown under each ayah; empty = none. */
  translationId: string;
  presencePollMs: number;
  e2e: boolean;
}

/** Validate the public env; a bad value throws naming the variable. */
export function readConfig(env: Env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid web config: ${problems}`);
  }
  const e = parsed.data;
  return {
    apiUrl: e.NEXT_PUBLIC_API_URL,
    wsUrl: e.NEXT_PUBLIC_WS_URL,
    programmeUrl: e.NEXT_PUBLIC_PROGRAMME_URL,
    rateNudgeMax: e.NEXT_PUBLIC_RATE_NUDGE_MAX,
    translationId: e.NEXT_PUBLIC_TRANSLATION_ID,
    presencePollMs: e.NEXT_PUBLIC_PRESENCE_POLL_MS,
    e2e: e.NEXT_PUBLIC_E2E,
  };
}

let cached: Config | null = null;

/**
 * The site's config, read on first use in the browser. Lazy so that a build
 * without the API URLs (CI) still succeeds; the page then fails loudly at
 * runtime instead of shipping localhost URLs. Each variable is referenced
 * literally so Next inlines it at build time.
 */
export function getConfig(): Config {
  cached ??= readConfig({
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
    NEXT_PUBLIC_PROGRAMME_URL: process.env.NEXT_PUBLIC_PROGRAMME_URL,
    NEXT_PUBLIC_RATE_NUDGE_MAX: process.env.NEXT_PUBLIC_RATE_NUDGE_MAX,
    NEXT_PUBLIC_TRANSLATION_ID: process.env.NEXT_PUBLIC_TRANSLATION_ID,
    NEXT_PUBLIC_PRESENCE_POLL_MS: process.env.NEXT_PUBLIC_PRESENCE_POLL_MS,
    NEXT_PUBLIC_E2E: process.env.NEXT_PUBLIC_E2E,
  });
  return cached;
}

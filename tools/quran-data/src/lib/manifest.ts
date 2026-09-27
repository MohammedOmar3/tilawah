import { createHash } from "node:crypto";

export const TEXT_SOURCE = "tanzil-uthmani-hafs";

export interface Manifest {
  source: string;
  files: Record<string, string>;
}

export function sha256Hex(buf: Uint8Array): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** Hash every file; keys are sorted so the serialised manifest is deterministic. */
export function buildManifest(files: Record<string, Uint8Array>, source: string = TEXT_SOURCE): Manifest {
  const out: Record<string, string> = {};
  for (const name of Object.keys(files).sort()) out[name] = sha256Hex(files[name]!);
  return { source, files: out };
}

import { fileURLToPath } from "node:url";
import path from "node:path";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const sourcesDir = path.join(repoRoot, "data/sources");
export const webDataDir = path.join(repoRoot, "apps/web/public/data");
export const devAudioDir = path.join(repoRoot, "apps/web/public/dev-audio");

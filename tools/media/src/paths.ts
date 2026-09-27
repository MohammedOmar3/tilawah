import path from "node:path";
import { fileURLToPath } from "node:url";

export const mediaRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const repoRoot = path.resolve(mediaRoot, "../..");
export const inputDir = (reciterId: string) => path.join(mediaRoot, "input", reciterId);
export const outputDir = (reciterId: string) => path.join(mediaRoot, "output", reciterId);
export const webDataDir = path.join(repoRoot, "apps/web/public/data");
export const pad3 = (n: number) => String(n).padStart(3, "0");

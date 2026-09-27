// Encodes input/<reciterId>/audio/NNN.* to output/<reciterId>/NNN.m4a and writes durations.json.
// Usage: pnpm --filter media encode <reciterId>
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import path from "node:path";
import { encode, probeDurationMs } from "./encode";
import { inputDir, outputDir, pad3 } from "./paths";

const reciterId = process.argv[2];
if (!reciterId) {
  console.error("usage: encode <reciterId>");
  process.exit(2);
}
const audioIn = path.join(inputDir(reciterId), "audio");
const out = outputDir(reciterId);
mkdirSync(out, { recursive: true });
const files = readdirSync(audioIn);

const durations: Record<string, number> = {};
const queue = Array.from({ length: 114 }, (_, i) => i + 1);
await Promise.all(
  Array.from({ length: Math.max(1, cpus().length) }, async () => {
    for (let s = queue.shift(); s !== undefined; s = queue.shift()) {
      const n = pad3(s);
      const src = files.find((f) => f.startsWith(`${n}.`) && !f.endsWith(".part"));
      if (!src) throw new Error(`missing input audio for surah ${n}`);
      const input = path.join(audioIn, src);
      const output = path.join(out, `${n}.m4a`);
      if (!existsSync(output) || statSync(output).mtimeMs < statSync(input).mtimeMs) await encode(input, output);
      durations[n] = await probeDurationMs(output);
      console.log(`surah ${n}: ${durations[n]} ms`);
    }
  }),
);
const sorted = Object.fromEntries(Object.entries(durations).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(path.join(out, "durations.json"), JSON.stringify(sorted, null, 2) + "\n");
console.log(`encoded 114 surahs to ${out}`);

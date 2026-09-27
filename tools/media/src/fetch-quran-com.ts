// Downloads a Quran.com chapter recitation (audio + verse timings) into input/<reciterId>/.
// Usage: pnpm --filter media fetch <quranComRecitationId> <reciterId> "<Reciter name>"
import { createWriteStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { inputDir, pad3 } from "./paths";

const [recitationId, reciterId, name] = process.argv.slice(2);
if (!recitationId || !reciterId || !name) {
  console.error('usage: fetch <quranComRecitationId> <reciterId> "<Reciter name>"');
  process.exit(2);
}

const dir = inputDir(reciterId);
mkdirSync(path.join(dir, "audio"), { recursive: true });
mkdirSync(path.join(dir, "timings"), { recursive: true });
writeFileSync(path.join(dir, "reciter.json"), JSON.stringify({ id: reciterId, name, riwayah: "hafs" }, null, 2) + "\n");

async function fetchOk(url: string): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (attempt >= 4) throw new Error(`${url}: ${err instanceof Error ? err.message : String(err)}`);
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}

async function one(surah: number): Promise<void> {
  const n = pad3(surah);
  const timingsFile = path.join(dir, "timings", `${n}.json`);
  const audioFile = path.join(dir, "audio", `${n}.mp3`);
  const api = `https://api.quran.com/api/v4/chapter_recitations/${recitationId}/${surah}?segments=true`;
  const body = (await (await fetchOk(api)).json()) as { audio_file: { audio_url: string } };
  writeFileSync(timingsFile, JSON.stringify(body) + "\n");
  if (!existsSync(audioFile)) {
    const res = await fetchOk(body.audio_file.audio_url);
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(audioFile + ".part"));
    const { renameSync } = await import("node:fs");
    renameSync(audioFile + ".part", audioFile);
  }
  console.log(`surah ${n} ok`);
}

const queue = Array.from({ length: 114 }, (_, i) => i + 1);
await Promise.all(
  Array.from({ length: 4 }, async () => {
    for (let s = queue.shift(); s !== undefined; s = queue.shift()) await one(s);
  }),
);
console.log("all 114 surahs fetched");

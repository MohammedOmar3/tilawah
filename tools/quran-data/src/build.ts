import { SurahText, Surahs } from "@tilawah/contracts";
import { readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { TEXT_SOURCE, buildManifest } from "./lib/manifest";
import { parseSurahMetadata } from "./lib/metadata";
import { parseTanzilText } from "./lib/text";
import { sourcesDir, webDataDir } from "./paths";

const TOTAL_AYAHS = 6236;

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

async function main(): Promise<void> {
  const surahs = Surahs.parse(parseSurahMetadata(readFileSync(path.join(sourcesDir, "tanzil/quran-data.xml"), "utf8")));
  const text = parseTanzilText(readFileSync(path.join(sourcesDir, "tanzil/quran-uthmani.txt"), "utf8"));

  // Cross-check the two sources against each other.
  if (text.size !== 114) throw new Error(`expected 114 surahs in text, got ${text.size}`);
  let total = 0;
  for (const s of surahs) {
    const ayahs = text.get(s.number);
    if (!ayahs) throw new Error(`surah ${s.number} missing from text`);
    if (ayahs.length !== s.ayahCount) {
      throw new Error(`surah ${s.number}: text has ${ayahs.length} ayahs, metadata says ${s.ayahCount}`);
    }
    total += ayahs.length;
  }
  if (total !== TOTAL_AYAHS) throw new Error(`expected ${TOTAL_AYAHS} ayahs, got ${total}`);

  await mkdir(webDataDir, { recursive: true });
  await writeFile(path.join(webDataDir, "surahs.json"), JSON.stringify(surahs, null, 2) + "\n");

  const textDir = path.join(webDataDir, "text");
  await rm(textDir, { recursive: true, force: true });
  await mkdir(textDir, { recursive: true });

  const written: Record<string, Buffer> = {};
  for (const s of surahs) {
    const doc = SurahText.parse({ surah: s.number, source: TEXT_SOURCE, ayahs: text.get(s.number)! });
    const bytes = Buffer.from(JSON.stringify(doc), "utf8");
    // Guard: serialisation must round-trip the text exactly.
    const back = SurahText.parse(JSON.parse(bytes.toString("utf8")));
    back.ayahs.forEach((a, i) => {
      if (a.text !== text.get(s.number)![i]!.text) throw new Error(`round-trip mismatch at ${s.number}:${a.n}`);
    });
    const name = `${pad3(s.number)}.json`;
    await writeFile(path.join(textDir, name), bytes);
    written[name] = bytes;
  }

  const manifest = buildManifest(written);
  await writeFile(path.join(textDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  console.log(`wrote surahs.json, ${Object.keys(written).length} text files and manifest.json (${total} ayahs)`);
}

await main();

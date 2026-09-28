import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { sourcesDir } from "./paths";

const SOURCES: { file: string; url: string }[] = [
  {
    file: "tanzil/quran-uthmani.txt",
    url: "https://tanzil.net/pub/download/index.php?marks=true&sajdah=true&rub=false&tatweel=true&quranType=uthmani&outType=txt-2&agree=true",
  },
  {
    // Pickthall (1930), public domain. The translation shown under each ayah.
    file: "tanzil/en.pickthall.txt",
    url: "https://tanzil.net/trans/?transID=en.pickthall&type=txt-2",
  },
  {
    file: "tanzil/quran-data.xml",
    url: "https://tanzil.net/res/text/metadata/quran-data.xml",
  },
];

const FAILED = "Download failed. Follow docs/SETUP-MANUAL.md step M-S4 to place the file manually.";

async function main(): Promise<void> {
  for (const { file, url } of SOURCES) {
    const dest = path.join(sourcesDir, file);
    if (existsSync(dest)) {
      console.log(`skip ${file} (exists)`);
      continue;
    }
    let body: Buffer;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      body = Buffer.from(await res.arrayBuffer());
    } catch (err) {
      console.error(`${file}: ${err instanceof Error ? err.message : String(err)}`);
      console.error(FAILED);
      process.exit(1);
    }
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, body);
    console.log(`${file} ${createHash("sha256").update(body).digest("hex")}`);
  }
}

await main();

export interface Ayah {
  n: number;
  text: string;
}

const INT = /^[1-9][0-9]*$/;

/**
 * Parse Tanzil's `surah|ayah|text` format into ayahs grouped by surah.
 * Blank lines and `#` comments are skipped. The text field is never altered.
 */
export function parseTanzilText(input: string): Map<number, Ayah[]> {
  const out = new Map<number, Ayah[]>();
  let current = 0;
  const lines = input.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    let line = lines[i]!;
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (line === "" || line.startsWith("#")) continue;

    const a = line.indexOf("|");
    const b = a === -1 ? -1 : line.indexOf("|", a + 1);
    if (a === -1 || b === -1) throw new Error(`malformed line ${lineNo}: expected surah|ayah|text`);
    const surahField = line.slice(0, a);
    const ayahField = line.slice(a + 1, b);
    const text = line.slice(b + 1);
    if (!INT.test(surahField) || !INT.test(ayahField) || text === "") {
      throw new Error(`malformed line ${lineNo}: expected surah|ayah|text`);
    }
    const surah = Number(surahField);
    const n = Number(ayahField);

    if (surah !== current) {
      if (out.has(surah) || surah < current) {
        throw new Error(`surah ${surah} out of order at line ${lineNo}`);
      }
      out.set(surah, []);
      current = surah;
    }
    const ayahs = out.get(surah)!;
    const expected = ayahs.length + 1;
    if (n !== expected) {
      throw new Error(`ayah ${surah}:${n} out of order at line ${lineNo} (expected ${expected})`);
    }
    ayahs.push({ n, text });
  }
  return out;
}

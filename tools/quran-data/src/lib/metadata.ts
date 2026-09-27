import { Surah } from "@tilawah/contracts";
import { XMLParser } from "fast-xml-parser";

interface SuraAttrs {
  index: string;
  ayas: string;
  name: string;
  tname: string;
  ename: string;
  type: string;
}

function toRevelation(type: string): Surah["revelation"] {
  const t = type.toLowerCase();
  if (t === "meccan" || t === "medinan") return t;
  throw new Error(`unknown revelation type "${type}"`);
}

/** Parse Tanzil's quran-data.xml into contract `Surah` entries, sorted by number. */
export function parseSurahMetadata(xml: string): Surah[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    parseAttributeValue: false,
    isArray: (name) => name === "sura",
  });
  const doc = parser.parse(xml) as { quran?: { suras?: { sura?: SuraAttrs[] } } };
  const suras = doc.quran?.suras?.sura;
  if (!suras || suras.length === 0) throw new Error("no <sura> elements in metadata");
  return suras
    .map((s) =>
      Surah.parse({
        number: Number(s.index),
        nameArabic: String(s.name),
        nameTransliterated: String(s.tname),
        nameEnglish: String(s.ename),
        ayahCount: Number(s.ayas),
        revelation: toRevelation(String(s.type)),
      }),
    )
    .sort((a, b) => a.number - b.number);
}

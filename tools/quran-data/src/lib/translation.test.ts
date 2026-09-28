import type { Surah } from "@tilawah/contracts";
import { describe, expect, it } from "vitest";
import { TRANSLATIONS, buildTranslation } from "./translation";

const surahs: Surah[] = [
  { number: 1, nameArabic: "أ", nameTransliterated: "A", nameEnglish: "A", ayahCount: 2, revelation: "meccan" },
  { number: 2, nameArabic: "ب", nameTransliterated: "B", nameEnglish: "B", ayahCount: 1, revelation: "medinan" },
];
const source = { id: "en.test", name: "Test", language: "en", file: "x" };

describe("buildTranslation", () => {
  it("builds one document per surah, keeping the text as published", () => {
    const docs = buildTranslation(source, "1|1|In the name,\n1|2|Praise  be\n2|1|Alif. Lam. Mim.\n\n# Name: Test\n", surahs);
    expect(docs).toEqual([
      { surah: 1, id: "en.test", name: "Test", language: "en", source: "tanzil", ayahs: [{ n: 1, text: "In the name," }, { n: 2, text: "Praise  be" }] },
      { surah: 2, id: "en.test", name: "Test", language: "en", source: "tanzil", ayahs: [{ n: 1, text: "Alif. Lam. Mim." }] },
    ]);
  });

  it("rejects a translation whose ayah counts differ from the metadata", () => {
    expect(() => buildTranslation(source, "1|1|a\n2|1|b\n", surahs)).toThrow(/surah 1 has 1 ayahs/);
    expect(() => buildTranslation(source, "1|1|a\n1|2|b\n", surahs)).toThrow(/expected 2 surahs/);
  });

  it("ships Pickthall", () => {
    expect(TRANSLATIONS.map((t) => t.id)).toEqual(["en.pickthall"]);
  });
});

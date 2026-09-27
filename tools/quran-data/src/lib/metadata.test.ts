import { describe, expect, it } from "vitest";
import { parseSurahMetadata } from "./metadata";

const xml = `<?xml version="1.0" encoding="utf-8"?><quran><suras alias="chapters">
  <sura index="1" ayas="7" start="0" name="الفاتحة" tname="Al-Faatiha" ename="The Opening" type="Meccan" order="5" rukus="1" />
  <sura index="2" ayas="286" start="7" name="البقرة" tname="Al-Baqara" ename="The Cow" type="Medinan" order="87" rukus="40" />
</suras></quran>`;

describe("parseSurahMetadata", () => {
  it("maps Tanzil attributes to the contract shape", () => {
    expect(parseSurahMetadata(xml)).toEqual([
      { number: 1, nameArabic: "الفاتحة", nameTransliterated: "Al-Faatiha", nameEnglish: "The Opening", ayahCount: 7, revelation: "meccan" },
      { number: 2, nameArabic: "البقرة", nameTransliterated: "Al-Baqara", nameEnglish: "The Cow", ayahCount: 286, revelation: "medinan" },
    ]);
  });
});

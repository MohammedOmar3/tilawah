import { SurahTranslation, type Surah } from "@tilawah/contracts";
import { parseTanzilText } from "./text";

export interface TranslationSource {
  /** Tanzil id, also the output directory name. */
  id: string;
  name: string;
  language: string;
  /** Path under data/sources. */
  file: string;
}

/** The translations the site ships. Each must be free to redistribute. */
export const TRANSLATIONS: readonly TranslationSource[] = [
  // Marmaduke Pickthall, 1930. Public domain.
  { id: "en.pickthall", name: "Pickthall", language: "en", file: "tanzil/en.pickthall.txt" },
];

/**
 * Parse a Tanzil translation file into one validated document per surah,
 * checked ayah for ayah against the surah metadata. The text is never altered.
 */
export function buildTranslation(t: TranslationSource, input: string, surahs: readonly Surah[]): SurahTranslation[] {
  const parsed = parseTanzilText(input);
  if (parsed.size !== surahs.length) {
    throw new Error(`${t.id}: expected ${surahs.length} surahs, got ${parsed.size}`);
  }
  return surahs.map((s) => {
    const ayahs = parsed.get(s.number);
    if (!ayahs) throw new Error(`${t.id}: surah ${s.number} missing`);
    if (ayahs.length !== s.ayahCount) {
      throw new Error(`${t.id}: surah ${s.number} has ${ayahs.length} ayahs, metadata says ${s.ayahCount}`);
    }
    return SurahTranslation.parse({
      surah: s.number,
      id: t.id,
      name: t.name,
      language: t.language,
      source: "tanzil",
      ayahs,
    });
  });
}

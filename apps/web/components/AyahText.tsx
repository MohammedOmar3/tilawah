import { toArabicDigits } from "@/lib/format";

export interface AyahLine {
  n: number;
  text: string;
}

export interface AyahTextProps {
  /** The surah's ayat, or null while the text loads. */
  ayahs: readonly AyahLine[] | null;
  /** Ayah being recited; 0 = the opening before ayah 1. */
  current: number;
}

/**
 * The ayah being recited, and only that one, so the block stays small. The text
 * is shown exactly as published by Tanzil; only the end-of-ayah marker is added.
 * At the opening, the first ayah waits dimmed.
 */
export default function AyahText({ ayahs, current }: AyahTextProps) {
  if (!ayahs) return <div aria-busy="true" className="min-h-16" />;
  const shown = current > 0 ? ayahs.find((a) => a.n === current) : ayahs[0];
  if (!shown) return null;
  const isCurrent = current > 0;
  return (
    <p
      key={shown.n}
      lang="ar"
      dir="rtl"
      aria-current={isCurrent ? "true" : undefined}
      className={`m-0 max-w-[34ch] font-quran text-ink [text-wrap:balance] motion-safe:animate-rise ${isCurrent ? "" : "opacity-45"}`}
      style={{ fontSize: "calc(clamp(1.3rem, 3.6vw, 1.95rem) * var(--ayah-scale, 1) * var(--fit, 1))", lineHeight: 1.95 }}
    >
      {shown.text} <span className="whitespace-nowrap text-[0.8em] text-gold">{`﴿${toArabicDigits(shown.n)}﴾`}</span>
    </p>
  );
}

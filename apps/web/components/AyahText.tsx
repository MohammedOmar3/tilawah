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
  /** Translation of the current ayah (decision D3: off unless configured). */
  translation?: string;
}

/** The text is shown exactly as published by Tanzil; only the end-of-ayah marker is added. */
function Line({ ayah, isCurrent }: { ayah: AyahLine; isCurrent: boolean }) {
  return (
    <p
      lang="ar"
      dir="rtl"
      aria-current={isCurrent ? "true" : undefined}
      className={
        isCurrent
          ? "font-quran text-2xl leading-[2.4] text-fg sm:text-3xl sm:leading-[2.4]"
          : "font-quran text-lg leading-[2.2] text-fg opacity-40 sm:text-xl"
      }
    >
      {ayah.text} <span className="text-gold">{`۝${toArabicDigits(ayah.n)}`}</span>
    </p>
  );
}

export default function AyahText({ ayahs, current, translation }: AyahTextProps) {
  if (!ayahs) {
    return <div aria-busy="true" className="min-h-32" />;
  }
  const at = (n: number) => ayahs.find((a) => a.n === n);
  const prev = current > 1 ? at(current - 1) : undefined;
  const cur = current > 0 ? at(current) : undefined;
  const next = at(current + 1);
  return (
    <section aria-label="Current ayah" className="flex min-h-32 flex-col gap-3 text-center">
      {prev && <Line ayah={prev} isCurrent={false} />}
      {cur && <Line ayah={cur} isCurrent />}
      {translation && (
        <p data-testid="translation" lang="en" className="text-sm italic leading-relaxed text-muted">
          {translation}
        </p>
      )}
      {next && <Line ayah={next} isCurrent={false} />}
    </section>
  );
}

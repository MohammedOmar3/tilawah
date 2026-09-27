import type { Surah } from "@tilawah/contracts";

export interface NowPlayingProps {
  surah: Surah | null;
  ayah: number;
}

export default function NowPlaying({ surah, ayah }: NowPlayingProps) {
  if (!surah) {
    return (
      <div className="text-center text-muted" aria-busy="true">
        Loading…
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <p lang="ar" dir="rtl" className="font-quran text-3xl leading-relaxed text-gold-bright">
        {surah.nameArabic}
      </p>
      <h1 className="text-xl font-medium tracking-wide text-fg" data-testid="surah-name">
        {surah.nameTransliterated}
        <span className="text-muted"> · {surah.nameEnglish}</span>
      </h1>
      <p className="text-sm text-muted">
        Surah {surah.number} · <span data-testid="ayah-label">{ayah === 0 ? "Opening" : `Ayah ${ayah}`}</span>
      </p>
    </div>
  );
}

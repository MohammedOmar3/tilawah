import type { Surah } from "@tilawah/contracts";
import { formatUntil } from "@/lib/format";
import type { Status } from "@/lib/sync";
import ProgressBar from "./ProgressBar";
import StatusLine from "./StatusLine";

export interface NowInfo {
  surah: Surah | null;
  /** 0 = the opening before ayah 1. */
  ayah: number;
  posMs: number;
  durationMs: number;
  reciter: string;
  riwayah: string;
  next: Surah | null;
  msToNext: number;
}

export function ayahLabel(ayah: number): string {
  return ayah === 0 ? "Opening" : `Ayah ${ayah}`;
}

/** What is being recited right now, on the join screen. */
export default function NowCard({ now, status }: { now: NowInfo | null; status: Status }) {
  return (
    <div className="glass grid w-full max-w-[380px] gap-2.5 rounded-[18px] px-4 pt-3.5 pb-3 text-left">
      <StatusLine status={status} className="text-[10.5px] font-semibold tracking-[0.16em] text-ink-3 uppercase" />
      {now?.surah ? (
        <>
          <div className="flex items-center gap-3.5">
            <span lang="ar" dir="rtl" className="font-title-ar text-[30px] leading-[1.1] font-bold text-gold">
              {now.surah.nameArabic}
            </span>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-ink" data-testid="surah-name">
                Surah {now.surah.nameTransliterated}
              </h2>
              <p className="text-[12.5px] text-ink-2 tabular-nums">
                <span data-testid="ayah-label">{ayahLabel(now.ayah)}</span> of {now.surah.ayahCount}
                {now.reciter && ` · ${now.reciter}`}
              </p>
            </div>
          </div>
          <ProgressBar posMs={now.posMs} durationMs={now.durationMs} />
          {now.next && (
            <p className="text-xs text-ink-3">
              Up next: Surah {now.next.nameTransliterated}, {formatUntil(now.msToNext)}
            </p>
          )}
        </>
      ) : (
        <p aria-busy="true" className="text-sm text-ink-3">
          Loading…
        </p>
      )}
    </div>
  );
}

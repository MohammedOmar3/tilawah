"use client";

import type { NowInfo } from "./NowCard";
import Sheet, { SheetGroup } from "./Sheet";
import { formatUntil } from "@/lib/format";

export interface AboutSheetProps {
  open: boolean;
  onClose: () => void;
  now: NowInfo | null;
}

const REVELATION = { meccan: "Meccan", medinan: "Medinan" } as const;

/** About this recitation: the surah, the reciter, the text, and how the shared recitation works. */
export default function AboutSheet({ open, onClose, now }: AboutSheetProps) {
  const surah = now?.surah;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel="Close"
      title={surah ? `Surah ${surah.nameTransliterated}` : "About this recitation"}
      subtitle={surah ? `${surah.nameEnglish} · ${REVELATION[surah.revelation]} · ${surah.ayahCount} ayat` : undefined}
    >
      <SheetGroup>
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {now?.reciter && (
            <>
              <dt className="text-ink-3">Reciter</dt>
              <dd className="m-0">{now.reciter}</dd>
            </>
          )}
          {now?.riwayah && (
            <>
              <dt className="text-ink-3">Riwayah</dt>
              <dd className="m-0">{now.riwayah}</dd>
            </>
          )}
          <dt className="text-ink-3">Text</dt>
          <dd className="m-0">
            Tanzil Uthmani, checksummed (
            <a href="https://tanzil.net" className="underline decoration-line-strong underline-offset-4">
              tanzil.net
            </a>
            )
          </dd>
          {now?.next && (
            <>
              <dt className="text-ink-3">Up next</dt>
              <dd className="m-0">
                Surah {now.next.nameTransliterated}, {formatUntil(now.msToNext)}
              </dd>
            </>
          )}
        </dl>
      </SheetGroup>
      <SheetGroup label="How this works">
        <p className="m-0 text-sm text-ink-2">
          Everyone hears the same ayah at the same moment. The recitation runs continuously from Al-Fatiha to An-Nas and
          starts again, so there is nothing to pause or skip.
        </p>
      </SheetGroup>
    </Sheet>
  );
}

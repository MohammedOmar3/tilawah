"use client";

import type { ReactNode, Ref } from "react";
import { formatDuration } from "@/lib/format";
import type { Status } from "@/lib/sync";
import { InfoIcon, TranslateIcon } from "./icons";
import ProgressBar from "./ProgressBar";
import StatusLine from "./StatusLine";

export interface DockProps {
  status: Status;
  reciter: string;
  /** 0 = the opening before ayah 1. */
  ayah: number;
  ayahCount: number;
  posMs: number;
  durationMs: number;
  onLeave: () => void;
  onAbout: () => void;
  /** Null when no translation is configured: the toggle is hidden. */
  translation: { on: boolean; onChange: (on: boolean) => void } | null;
  /** A quiet line above the panel: the all-time totals. */
  footnote?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

const chip =
  "inline-flex h-[34px] items-center gap-[7px] rounded-full border border-transparent px-3 text-[13px] text-ink-2 transition-colors hover:bg-gold-wash hover:text-ink max-[440px]:px-2.5";
const chipLabel = "max-[440px]:sr-only";

/** While listening: the status, where we are in the surah and the few controls there are. */
export default function Dock(props: DockProps) {
  const {
    status,
    reciter,
    ayah,
    ayahCount,
    posMs,
    durationMs,
    onLeave,
    onAbout,
    translation,
    footnote,
    ref,
  } = props;
  return (
    <div
      ref={ref}
      className="fixed bottom-0 left-1/2 z-[5] w-[min(100%,760px)] -translate-x-1/2 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+14px)]"
    >
      {footnote && (
        <div className="mb-2 flex justify-center text-center [@media(max-height:600px)]:hidden">
          <div className="glass rounded-full px-3.5 py-1.5">{footnote}</div>
        </div>
      )}
      <div className="glass grid gap-2.5 rounded-[22px] px-4 pt-[13px] pb-[11px] shadow-[var(--shadow)] backdrop-blur-[22px]">
        <div className="flex items-center justify-between gap-2.5 text-[12.5px] text-ink-2 tabular-nums">
          <StatusLine status={status} className="font-semibold text-ink" />
          <span className="min-w-0 flex-1 truncate text-ink-3">{reciter}</span>
          <span className="whitespace-nowrap">
            {ayah === 0 ? "Opening" : `Ayah ${ayah}`} of {ayahCount}
          </span>
        </div>
        <ProgressBar posMs={posMs} durationMs={durationMs} />
        <div className="flex items-center justify-between gap-2.5 text-[12.5px] text-ink-2 tabular-nums">
          <button
            type="button"
            onClick={onLeave}
            className={`${chip} border-line-strong text-ink`}
          >
            <span
              aria-hidden="true"
              className="size-[7px] rounded-full bg-danger"
            />
            Leave
          </button>
          <div className="flex items-center gap-1.5">
            {translation && (
              <button
                type="button"
                aria-pressed={translation.on}
                onClick={() => translation.onChange(!translation.on)}
                className={`${chip} aria-pressed:border-line-strong aria-pressed:text-gold`}
              >
                <TranslateIcon />
                <span className={chipLabel}>Translation</span>
              </button>
            )}
            <button type="button" onClick={onAbout} className={chip}>
              <InfoIcon />
              <span className={chipLabel}>About</span>
            </button>
          </div>
          <span className="whitespace-nowrap">
            {formatDuration(posMs)} / {formatDuration(durationMs)}
          </span>
        </div>
      </div>
    </div>
  );
}

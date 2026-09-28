import { formatDuration } from "@/lib/format";

export interface ProgressBarProps {
  posMs: number;
  durationMs: number;
  label?: string;
}

/** A thin gold line through the surah, with a soft marker at the current position. */
export default function ProgressBar({ posMs, durationMs, label = "Position in this surah" }: ProgressBarProps) {
  const pct = durationMs > 0 ? Math.min(100, Math.max(0, (posMs / durationMs) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-valuetext={`${formatDuration(posMs)} of ${formatDuration(durationMs)}`}
      className="relative h-[3px] w-full rounded-full bg-line-strong"
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-gold-soft to-gold transition-[width] duration-1000 ease-linear"
        style={{ width: `${pct}%` }}
      >
        <span
          aria-hidden="true"
          className="absolute top-1/2 -right-1 size-[9px] -translate-y-1/2 rounded-full bg-gold shadow-[0_0_0_4px_var(--gold-wash)]"
        />
      </div>
    </div>
  );
}

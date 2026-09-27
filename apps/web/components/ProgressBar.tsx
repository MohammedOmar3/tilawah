import { formatDuration } from "@/lib/format";

export interface ProgressBarProps {
  posMs: number;
  durationMs: number;
}

export default function ProgressBar({ posMs, durationMs }: ProgressBarProps) {
  const pct = durationMs > 0 ? Math.min(100, Math.max(0, (posMs / durationMs) * 100)) : 0;
  const text = `${formatDuration(posMs)} / ${formatDuration(durationMs)}`;
  return (
    <div className="flex w-full flex-col gap-1.5">
      <div
        role="progressbar"
        aria-label="Position in this surah"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-valuetext={text}
        className="h-1 w-full overflow-hidden rounded-full bg-line"
      >
        <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-right text-xs tabular-nums text-muted">{text}</p>
    </div>
  );
}

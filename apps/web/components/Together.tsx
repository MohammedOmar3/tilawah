import type { PresenceTotals } from "@tilawah/contracts";
import { formatCount } from "@/lib/format";
import { formatMinutes, formatSince, type RecitedTotals } from "@/lib/totals";

/** The all-time figures: recited ones derived from the clock, listening ones from the API (null until it reports them). */
export interface TogetherInfo {
  recited: RecitedTotals;
  /** The programme epoch, when the recited figures start. */
  recitedSinceMs: number;
  listening: PresenceTotals | null;
}

const plural = (n: number, one: string, many: string) => `${formatCount(n)} ${n === 1 ? one : many}`;

/** One quiet line on the join screen: "4,210 hours listened together · 312 surahs recited". */
export function TogetherLine({ together, className = "" }: { together: TogetherInfo; className?: string }) {
  const { listening, recited } = together;
  return (
    <p data-testid="together" className={`m-0 text-[13px] text-ink-2 tabular-nums ${className}`}>
      {listening && (
        <>
          <strong className="font-semibold text-ink">{formatMinutes(listening.listeningMinutes)}</strong> listened
          together <span aria-hidden="true">·</span>{" "}
        </>
      )}
      <strong className="font-semibold text-ink">{plural(recited.surahs, "surah", "surahs")}</strong> recited
    </p>
  );
}

/** The full set, for the About sheet. */
export function TogetherList({ together }: { together: TogetherInfo }) {
  const { listening, recited, recitedSinceMs } = together;
  const rows: [string, string][] = [
    ["Recited", formatMinutes(recited.recitedMs / 60_000)],
    ["Surahs", formatCount(recited.surahs)],
    ["Khatms", formatCount(recited.khatms)],
  ];
  const listeningRows: [string, string][] = listening
    ? [
        ["Listened", formatMinutes(listening.listeningMinutes)],
        ["Most at once", plural(listening.peakListeners, "listener", "listeners")],
        ["Countries", formatCount(listening.countries)],
      ]
    : [];
  return (
    <div className="grid gap-3 text-sm">
      <Rows caption={`Since the recitation began, ${formatSince(recitedSinceMs)}`} rows={rows} />
      {listening && <Rows caption={`Listened together since ${formatSince(listening.since)}`} rows={listeningRows} />}
    </div>
  );
}

function Rows({ caption, rows }: { caption: string; rows: [string, string][] }) {
  return (
    <div>
      <p className="m-0 mb-1.5 text-ink-2">{caption}</p>
      <dl className="m-0 grid grid-cols-[7rem_1fr] gap-x-4 gap-y-1 tabular-nums">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-ink-3">{k}</dt>
            <dd className="m-0">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

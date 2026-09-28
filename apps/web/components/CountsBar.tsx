import { formatCount } from "@/lib/format";

export interface CountsBarProps {
  listeners: number | null;
  countries: number | null;
  /** The last snapshot could not be refreshed. */
  stale?: boolean;
}

function label(listeners: number | null, countries: number | null): string {
  if (listeners === null || countries === null) return "Listener count loading";
  const people = listeners === 1 ? "person" : "people";
  const places = countries === 1 ? "country" : "countries";
  return `${formatCount(listeners)} ${people} listening from ${formatCount(countries)} ${places}`;
}

/** The presence pill in the header: "4,821 listening • 84 countries" (countries hide on narrow phones). */
export default function CountsBar({ listeners, countries, stale = false }: CountsBarProps) {
  const l = listeners === null ? "—" : formatCount(listeners);
  const c = countries === null ? "—" : formatCount(countries);
  return (
    <div
      role="group"
      data-testid="counts"
      data-listeners={listeners ?? ""}
      aria-label={label(listeners, countries)}
      className={`glass inline-flex h-[34px] items-center gap-2 rounded-full px-3.5 text-[13px] whitespace-nowrap text-ink-2 tabular-nums transition-opacity ${stale ? "opacity-70" : ""}`}
    >
      <span aria-hidden="true" className="size-[7px] shrink-0 rounded-full bg-presence motion-safe:animate-breathe" />
      <span aria-hidden="true">
        <strong className="font-semibold text-ink">{l}</strong> listening
      </span>
      <span aria-hidden="true" className="size-[3px] rounded-full bg-ink-3 max-[430px]:hidden" />
      <span aria-hidden="true" className="max-[430px]:hidden">
        <strong className="font-semibold text-ink">{c}</strong> {countries === 1 ? "country" : "countries"}
      </span>
    </div>
  );
}

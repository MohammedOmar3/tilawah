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

export default function CountsBar({ listeners, countries, stale = false }: CountsBarProps) {
  const l = listeners === null ? "—" : formatCount(listeners);
  const c = countries === null ? "—" : formatCount(countries);
  return (
    <div
      role="group"
      data-testid="counts"
      data-listeners={listeners ?? ""}
      aria-label={label(listeners, countries)}
      className={`flex items-center justify-center gap-3 text-sm tracking-wide text-muted ${stale ? "opacity-70" : ""}`}
    >
      <span aria-hidden="true">
        <span className="font-medium text-fg">{l}</span> listening
      </span>
      <span aria-hidden="true" className="text-line">
        ·
      </span>
      <span aria-hidden="true">
        <span className="font-medium text-fg">{c}</span> {countries === 1 ? "country" : "countries"}
      </span>
    </div>
  );
}

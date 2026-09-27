export interface AyahAnnouncerProps {
  enabled: boolean;
  surahName: string;
  ayah: number;
}

/** Opt-in, polite announcement of each new ayah (spec §5.5). Off by default. */
export default function AyahAnnouncer({ enabled, surahName, ayah }: AyahAnnouncerProps) {
  if (!enabled) return null;
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {`${surahName}, ${ayah === 0 ? "opening" : `ayah ${ayah}`}`}
    </div>
  );
}

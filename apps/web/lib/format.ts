const countFormat = new Intl.NumberFormat("en-US");

export function formatCount(n: number): string {
  return countFormat.format(n);
}

/** `m:ss` under an hour, `h:mm:ss` from an hour. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";

export function toArabicDigits(n: number): string {
  return String(n).replace(/[0-9]/g, (d) => ARABIC_INDIC[Number(d)]!);
}

/** "in under a minute", "in 29 min", "in 1 h 5 min": when the next surah starts. */
export function formatUntil(ms: number): string {
  const min = Math.floor(Math.max(0, ms) / 60_000);
  if (min < 1) return "in under a minute";
  if (min < 60) return `in ${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `in ${h} h` : `in ${h} h ${m} min`;
}

const RIWAYAH: Record<string, string> = { hafs: "Hafs 'an 'Asim", warsh: "Warsh 'an Nafi'" };

/** The programme's riwayah id as listeners know it ("hafs" → "Hafs 'an 'Asim"). */
export function riwayahName(id: string): string {
  return RIWAYAH[id.toLowerCase()] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

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

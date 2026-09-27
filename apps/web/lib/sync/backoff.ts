export const BACKOFF_BASE_MS = 1000;
export const BACKOFF_MAX_MS = 30000;

/** Exponential backoff with full jitter: random() × min(30 s, 1 s × 2^attempt). */
export function backoffDelay(attempt: number, random: () => number): number {
  const ceiling = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempt));
  return random() * ceiling;
}

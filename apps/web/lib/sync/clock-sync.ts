/** One ping round trip: client send time, server receipt time, client receipt time. */
export interface ClockSample {
  c0: number;
  s: number;
  c1: number;
}

/** Re-accept a worse burst when the last accepted one is older than this. */
export const STALE_AFTER_MS = 15 * 60 * 1000;
/** A later burst is applied only if its RTT is ≤ this × the best RTT seen. */
export const RTT_TOLERANCE = 1.5;

/**
 * NTP-style clock offset estimation (spec §5.2):
 * offset = s − (c0 + c1) / 2 from the lowest-RTT sample of a burst.
 */
export class ClockSync {
  private offset: number | null = null;
  private rtt: number | null = null;
  private bestRttSeen = Infinity;
  private lastAcceptedAt = -Infinity;

  get synced(): boolean {
    return this.offset !== null;
  }

  /** Server clock − local clock, or 0 before the first sync. */
  get offsetMs(): number {
    return this.offset ?? 0;
  }

  /** RTT of the accepted sample, or null before the first sync. */
  get rttMs(): number | null {
    return this.rtt;
  }

  serverNow(localNow: number): number {
    return localNow + this.offsetMs;
  }

  /** Returns true when the burst's best sample was applied. */
  acceptBurst(samples: readonly ClockSample[]): boolean {
    let best: ClockSample | undefined;
    for (const s of samples) {
      if (!best || s.c1 - s.c0 < best.c1 - best.c0) best = s;
    }
    if (!best) return false;
    const rtt = best.c1 - best.c0;
    const stale = best.c1 - this.lastAcceptedAt > STALE_AFTER_MS;
    const good = rtt <= RTT_TOLERANCE * this.bestRttSeen;
    if (!this.synced || good || stale) {
      this.offset = best.s - (best.c0 + best.c1) / 2;
      this.rtt = rtt;
      this.lastAcceptedAt = best.c1;
      // After a stale re-accept the network may have changed: start the RTT baseline over.
      this.bestRttSeen = good ? Math.min(this.bestRttSeen, rtt) : rtt;
      return true;
    }
    return false;
  }
}

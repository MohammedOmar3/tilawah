import { Presence } from "@tilawah/contracts";
import { create } from "zustand";

export const MAX_BACKOFF_MS = 60_000;
/** Up to this fraction of the interval is added at random so clients don't poll in step. */
export const JITTER = 0.2;
/** The snapshot is marked stale after this many failed polls in a row. */
export const STALE_AFTER_FAILURES = 2;

export interface PresenceState {
  presence: Presence | null;
  stale: boolean;
}

export function createPresenceStore() {
  return create<PresenceState>()(() => ({ presence: null, stale: false }));
}

export type PresenceStoreApi = ReturnType<typeof createPresenceStore>;

/** The store the UI reads. */
export const usePresenceStore = createPresenceStore();

interface VisibilitySource {
  readonly visibilityState: string;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

export interface PresencePollerOptions {
  apiUrl: string;
  intervalMs: number;
  store?: PresenceStoreApi;
  fetch?: (url: string) => Promise<Response>;
  document?: VisibilitySource | null;
  random?: () => number;
}

export interface PresencePoller {
  start(): void;
  stop(): void;
}

/**
 * Polls the CDN-cached presence snapshot (spec §4.6). Pauses while the tab is
 * hidden; a failed or invalid response keeps the last good snapshot and backs off.
 */
export function createPresencePoller(options: PresencePollerOptions): PresencePoller {
  const url = `${options.apiUrl}/v1/presence.json`;
  const store = options.store ?? usePresenceStore;
  const fetchFn = options.fetch ?? ((u: string) => globalThis.fetch(u));
  const doc = options.document !== undefined ? options.document : (globalThis.document ?? null);
  const random = options.random ?? Math.random;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let failures = 0;
  /** Bumped on every poll so a response that arrives after stop/hide/refetch is ignored for scheduling. */
  let generation = 0;

  const hidden = () => doc?.visibilityState === "hidden";

  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const delay = () => {
    const base = failures === 0 ? options.intervalMs : options.intervalMs * 2 ** failures;
    return Math.min(base * (1 + JITTER * random()), MAX_BACKOFF_MS);
  };

  const poll = async () => {
    clear();
    const gen = ++generation;
    try {
      const res = await fetchFn(url);
      if (!res.ok) throw new Error(`presence: HTTP ${res.status}`);
      const presence = Presence.parse(await res.json());
      if (gen !== generation || !running) return;
      failures = 0;
      store.setState({ presence, stale: false });
    } catch {
      if (gen !== generation || !running) return;
      failures++;
      if (failures >= STALE_AFTER_FAILURES) store.setState({ stale: true });
    }
    if (gen !== generation || !running || hidden()) return;
    timer = setTimeout(() => void poll(), delay());
  };

  const onVisibility = () => {
    if (!running) return;
    if (hidden()) {
      // A poll still in flight lands, but schedules nothing further.
      clear();
    } else {
      void poll();
    }
  };

  return {
    start() {
      if (running) return;
      running = true;
      doc?.addEventListener("visibilitychange", onVisibility);
      if (!hidden()) void poll();
    },
    stop() {
      running = false;
      generation++;
      clear();
      doc?.removeEventListener("visibilitychange", onVisibility);
    },
  };
}

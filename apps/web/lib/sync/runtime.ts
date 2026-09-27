/**
 * The only place the sync engine touches browser globals. Every other module
 * receives these through injected deps, so tests run against fakes in
 * simulated time.
 */

export type TimerId = unknown;

export interface Timers {
  setTimeout(fn: () => void, ms: number): TimerId;
  clearTimeout(id: TimerId): void;
  setInterval(fn: () => void, ms: number): TimerId;
  clearInterval(id: TimerId): void;
}

/** Local monotonic-ish wall clock in ms. Never `Date.now()` (spec §5.2). */
export type NowFn = () => number;

export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export type WebSocketCtor = new (url: string) => WebSocketLike;

export const WS_OPEN = 1;

/** The subset of HTMLAudioElement the player uses. */
export interface AudioLike {
  src: string;
  currentTime: number;
  playbackRate: number;
  preservesPitch?: boolean;
  preload?: string;
  readonly paused: boolean;
  readonly readyState: number;
  play(): Promise<void> | void;
  pause(): void;
  load(): void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/** HTMLMediaElement.HAVE_FUTURE_DATA */
export const HAVE_FUTURE_DATA = 3;

export function browserNow(): number {
  return performance.timeOrigin + performance.now();
}

export function browserTimers(): Timers {
  return {
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof globalThis.setTimeout>),
    setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
    clearInterval: (id) => globalThis.clearInterval(id as ReturnType<typeof globalThis.setInterval>),
  };
}

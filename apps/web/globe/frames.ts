/**
 * The globe renders on demand. Nothing on it moves fast (a slow auto-rotation,
 * fading join rings, hexbin height transitions), so while something moves it
 * asks for frames at a capped rate instead of on every display refresh. This
 * keeps the main thread free for the timers and WebSocket messages that clock
 * sync depends on, especially on slow devices.
 */

/** Frames are requested at most this often (~30 fps). */
export const FRAME_INTERVAL_MS = 1000 / 30;
/** After the last change, keep rendering this long so the scene settles. */
export const SETTLE_MS = 300;
/** Longest step a single frame may advance the rotation by. */
export const MAX_FRAME_STEP_MS = 100;
/**
 * Auto-rotation speed in OrbitControls' `autoRotateSpeed` units: one turn every
 * 60 / speed seconds (4 minutes).
 */
export const AUTO_ROTATE_SPEED = 0.25;

/**
 * The auto-rotation angle (radians) for `dtMs` of elapsed time. OrbitControls
 * turns by a fixed angle per frame, tuned for 60 fps; this is the same speed
 * expressed in time, so the globe turns identically at any frame rate.
 */
export function autoRotateAngle(dtMs: number, speed = AUTO_ROTATE_SPEED): number {
  const perFrameAt60 = ((2 * Math.PI) / 60 / 60) * speed;
  return perFrameAt60 * (Math.min(Math.max(0, dtMs), MAX_FRAME_STEP_MS) / (1000 / 60));
}

type TimerId = unknown;

export interface FrameDriverDeps {
  now: () => number;
  setInterval(fn: () => void, ms: number): TimerId;
  clearInterval(id: TimerId): void;
}

export interface FrameDriverOptions {
  /** Advance animations by `dtMs` and request a frame (R3F `invalidate()`). */
  onFrame: (dtMs: number) => void;
  deps: FrameDriverDeps;
}

/** Requests frames at a capped rate while something moves, and none otherwise. */
export class FrameDriver {
  private readonly o: FrameDriverOptions;
  private continuous = false;
  private until = -Infinity;
  private ticker: TimerId | null = null;
  private last = 0;
  private disposed = false;

  constructor(options: FrameDriverOptions) {
    this.o = options;
  }

  get running(): boolean {
    return this.ticker !== null;
  }

  /** Something moves until further notice (auto-rotation, live rings). */
  setContinuous(on: boolean): void {
    if (this.disposed || on === this.continuous) return;
    this.continuous = on;
    if (on) this.start();
    else this.kick(SETTLE_MS);
  }

  /** Something changed: render for the next `ms` (e.g. a data transition). */
  kick(ms = SETTLE_MS): void {
    if (this.disposed) return;
    this.until = Math.max(this.until, this.o.deps.now() + ms);
    this.start();
  }

  dispose(): void {
    this.disposed = true;
    this.continuous = false;
    this.stop();
  }

  private start(): void {
    if (this.ticker !== null) return;
    const { deps } = this.o;
    this.last = deps.now();
    this.ticker = deps.setInterval(() => this.tick(), FRAME_INTERVAL_MS);
    this.o.onFrame(0);
  }

  private tick(): void {
    const t = this.o.deps.now();
    const dt = t - this.last;
    this.last = t;
    this.o.onFrame(dt);
    if (!this.continuous && t >= this.until) this.stop();
  }

  private stop(): void {
    if (this.ticker === null) return;
    this.o.deps.clearInterval(this.ticker);
    this.ticker = null;
  }
}

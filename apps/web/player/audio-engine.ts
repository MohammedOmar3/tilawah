import type { CompiledProgramme, Timings } from "@tilawah/contracts";
import { decide, DEFAULT_RATE_MAX, ENGAGE_ABOVE_MS, isInGap, median, nextGap, SEEK_ABOVE_MS } from "../lib/sync/drift";
import type { ProgrammeClock, Target } from "../lib/sync/programme-clock";
import { HAVE_FUTURE_DATA, type AudioLike, type TimerId, type Timers } from "../lib/sync/runtime";

export const CORRECTION_EVERY_MS = 1000;
export const PRELOAD_BEFORE_MS = 30_000;
/** Corrections act on the median of this many recent error readings, so one noisy read changes nothing. */
export const ERR_SAMPLES = 3;
/** After a seek, wait up to this many ticks for the playhead to move before measuring again. */
export const SEEK_SETTLE_TICKS = 5;
/** Upper bound for the learned seek lead. */
export const MAX_SEEK_LEAD_MS = 3000;

export interface EngineTick {
  trackIndex: number;
  posInTrackMs: number;
  errMs: number;
  rate: number;
}

export interface AudioEngineOptions {
  programmeClock: ProgrammeClock;
  compiled: CompiledProgramme;
  /** Timings for a track if already loaded (used to find silences when rateMax = 0). */
  getTimings: (trackIndex: number) => Timings | undefined;
  createAudio: () => AudioLike;
  outputLatencyMs?: number;
  rateMax?: number;
  deps: Timers;
  /** The first time audio actually starts playing. */
  onPlaying?: () => void;
  onTick?: (tick: EngineTick) => void;
  onTrackChange?: (trackIndex: number) => void;
  onError?: (error: unknown) => void;
}

type State = "idle" | "loading" | "starting" | "playing" | "stopped";

/**
 * Plays the programme on two audio elements (current + preloaded next),
 * keeping the heard position on the clock-derived target (spec §5.3).
 */
export class AudioEngine {
  private readonly o: AudioEngineOptions;
  private readonly latencyMs: number;
  private readonly rateMax: number;
  private current: AudioLike;
  private next: AudioLike;
  /** Track index whose audio the `next` element holds, or null. */
  private nextHolds: number | null = null;
  /** Absolute track number (loop × tracks + index) the current element plays. */
  private currentKey: number | null = null;
  private state: State = "idle";
  private stalled = false;
  /** Our own seek is in flight: buffering it causes is not a stall. */
  private seekPending = false;
  private reportedPlaying = false;
  /** Recent raw error readings since the last seek or track change. */
  private errSamples: number[] = [];
  /**
   * How long the element stands still after a seek before playing on (iOS
   * Safari: over a second, without a `waiting` event). Seeks aim this far
   * ahead so they land on time instead of seeking again and again.
   */
  private seekLeadMs = 0;
  /** Position of the last seek, in seconds, until the playhead has moved past it. */
  private seekFrom: number | null = null;
  private settleTicks = 0;
  private correction: TimerId | null = null;
  private boundaryTimer: TimerId | null = null;
  private gapTimer: TimerId | null = null;
  private readonly detach: Array<() => void> = [];

  constructor(options: AudioEngineOptions) {
    this.o = options;
    this.latencyMs = options.outputLatencyMs ?? 0;
    this.rateMax = options.rateMax ?? DEFAULT_RATE_MAX;
    this.current = this.makeElement();
    this.next = this.makeElement();
  }

  /** The element currently meant to be heard (exposed for tests and diagnostics). */
  get currentElement(): AudioLike {
    return this.current;
  }

  get playing(): boolean {
    return this.state === "playing";
  }

  start(): void {
    if (this.state !== "idle" && this.state !== "stopped") return;
    this.state = "loading";
    this.correction = this.o.deps.setInterval(() => this.tick(), CORRECTION_EVERY_MS);
    this.switchTo(this.o.programmeClock.target());
  }

  /** Run a correction immediately (after visibility/online/resync). */
  correctNow(): void {
    this.tick();
  }

  stop(): void {
    this.state = "stopped";
    const { deps } = this.o;
    if (this.correction !== null) deps.clearInterval(this.correction);
    this.correction = null;
    this.clearTimers();
    this.current.pause();
    this.next.pause();
    this.currentKey = null;
    this.stalled = false;
  }

  /** Remove element listeners; the engine cannot be restarted afterwards. */
  dispose(): void {
    this.stop();
    for (const off of this.detach.splice(0)) off();
  }

  private makeElement(): AudioLike {
    const el = this.o.createAudio();
    el.preservesPitch = true;
    el.preload = "auto";
    const on = (type: string, fn: () => void) => {
      el.addEventListener(type, fn);
      this.detach.push(() => el.removeEventListener(type, fn));
    };
    on("canplay", () => {
      if (el === this.current && this.state === "loading") this.begin();
    });
    on("seeked", () => {
      if (el === this.current) this.seekPending = false;
    });
    on("waiting", () => {
      if (el === this.current && this.state === "playing" && !this.seekPending) this.stalled = true;
    });
    on("playing", () => {
      if (el !== this.current) return;
      this.seekPending = false;
      if (this.state === "starting") {
        this.state = "playing";
        if (!this.reportedPlaying) {
          this.reportedPlaying = true;
          this.o.onPlaying?.();
        }
        this.tick();
      } else if (this.state === "playing" && this.stalled) {
        this.tick(true);
      }
    });
    on("error", () => {
      if (el === this.current && this.state !== "stopped") this.o.onError?.(new Error("audio element error"));
    });
    return el;
  }

  private keyOf(t: Target): number {
    return t.loop * this.o.compiled.programme.tracks.length + t.trackIndex;
  }

  /** Make the current element play target t's track (swapping in the preloaded one if it matches). */
  private switchTo(t: Target): void {
    this.clearTimers();
    const track = this.o.compiled.programme.tracks[t.trackIndex]!;
    this.stalled = false;
    this.errSamples = [];
    if (this.currentKey !== null && this.nextHolds === t.trackIndex) {
      const old = this.current;
      this.current = this.next;
      this.next = old;
      old.pause();
      old.playbackRate = 1;
      this.nextHolds = null;
    } else {
      this.current.pause();
      this.current.src = track.audio;
      if (this.nextHolds === t.trackIndex) this.nextHolds = null;
    }
    this.currentKey = this.keyOf(t);
    this.state = "loading";
    this.o.onTrackChange?.(t.trackIndex);
    if (this.current.readyState >= HAVE_FUTURE_DATA) this.begin();
  }

  /** The current element has data: seek to the (recomputed) target and play. */
  private begin(): void {
    const t = this.o.programmeClock.target();
    if (this.keyOf(t) !== this.currentKey) {
      this.switchTo(t);
      return;
    }
    this.seek(t);
    this.state = "starting";
    try {
      const p = this.current.play();
      if (p) p.catch((err: unknown) => this.o.onError?.(err));
    } catch (err) {
      this.o.onError?.(err);
    }
  }

  private seek(t: Target): void {
    this.errSamples = [];
    this.current.playbackRate = 1;
    this.seekPending = true;
    const to = (t.posInTrackMs + this.latencyMs + this.seekLeadMs) / 1000;
    this.seekFrom = to;
    this.settleTicks = 0;
    this.current.currentTime = to;
  }

  private tick(afterStall = false): void {
    if (this.state !== "playing") return;
    if (this.stalled && !afterStall) return;
    this.stalled = false;
    const t = this.o.programmeClock.target();
    if (this.keyOf(t) !== this.currentKey) {
      this.switchTo(t);
      return;
    }
    this.preload(t);
    const el = this.current;
    // Until the playhead moves after a seek, any reading only measures how long the seek is taking.
    let settledSeek = false;
    if (this.seekFrom !== null) {
      if (el.currentTime <= this.seekFrom + 0.02 && this.settleTicks++ < SEEK_SETTLE_TICKS) return;
      settledSeek = el.currentTime > this.seekFrom + 0.02;
      this.seekFrom = null;
    }
    // A stall invalidates earlier readings: the element stood still meanwhile.
    if (afterStall) this.errSamples = [];
    const rawErrMs = el.currentTime * 1000 - (t.posInTrackMs + this.latencyMs);
    // The first reading after a seek shows how far off the lead was: err = lead − actual resume delay.
    if (settledSeek) this.seekLeadMs = Math.min(MAX_SEEK_LEAD_MS, Math.max(0, this.seekLeadMs - rawErrMs));
    this.errSamples.push(rawErrMs);
    if (this.errSamples.length > ERR_SAMPLES) this.errSamples.shift();
    // An error beyond the seek threshold is never noise (e.g. after the page slept): act on it now.
    const errMs = Math.abs(rawErrMs) > SEEK_ABOVE_MS ? rawErrMs : median(this.errSamples);
    const timings = this.o.getTimings(t.trackIndex);
    const inGap = timings ? isInGap(timings.segments, t.posInTrackMs) : false;
    const d = decide({ errMs, rateMax: this.rateMax, inGap, stalled: afterStall, rate: el.playbackRate });
    this.clearTimers();
    if (d.kind === "seek") this.seek(t);
    else if (el.playbackRate !== d.rate) el.playbackRate = d.rate;
    if (d.kind === "hold" && this.rateMax <= 0 && Math.abs(errMs) > ENGAGE_ABOVE_MS && timings) {
      this.scheduleGapCorrection(timings, t.posInTrackMs);
    }
    this.o.onTick?.({
      trackIndex: t.trackIndex,
      posInTrackMs: t.posInTrackMs,
      errMs,
      rate: el.playbackRate,
    });
    // Change track exactly at the boundary rather than up to a tick late.
    this.boundaryTimer = this.o.deps.setTimeout(() => {
      this.boundaryTimer = null;
      this.tick();
    }, t.msToNextTrack + 1);
  }

  /** With rateMax = 0 a correction waits for silence; don't miss a gap shorter than a tick. */
  private scheduleGapCorrection(timings: Timings, posMs: number): void {
    const gap = nextGap(timings.segments, posMs);
    if (gap.startMs - posMs >= CORRECTION_EVERY_MS) return;
    const aim = Number.isFinite(gap.endMs) ? (gap.startMs + gap.endMs) / 2 : gap.startMs + 1;
    this.gapTimer = this.o.deps.setTimeout(() => {
      this.gapTimer = null;
      this.tick();
    }, Math.max(0, aim - posMs));
  }

  private preload(t: Target): void {
    if (t.msToNextTrack >= PRELOAD_BEFORE_MS) return;
    const tracks = this.o.compiled.programme.tracks;
    const nextIndex = (t.trackIndex + 1) % tracks.length;
    if (this.nextHolds === nextIndex) return;
    this.next.src = tracks[nextIndex]!.audio;
    this.next.load();
    this.nextHolds = nextIndex;
  }

  private clearTimers(): void {
    const { deps } = this.o;
    if (this.boundaryTimer !== null) deps.clearTimeout(this.boundaryTimer);
    if (this.gapTimer !== null) deps.clearTimeout(this.gapTimer);
    this.boundaryTimer = this.gapTimer = null;
  }
}

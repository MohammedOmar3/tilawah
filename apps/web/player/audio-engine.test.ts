import { compileProgramme, Programme, Timings } from "@tilawah/contracts";
import vectors from "@tilawah/contracts/fixtures/programme-vectors.json";
import timingsExample from "@tilawah/contracts/fixtures/timings.example.json";
import { describe, expect, it, vi } from "vitest";
import { ClockSync } from "../lib/sync/clock-sync";
import { isInGap } from "../lib/sync/drift";
import { ProgrammeClock } from "../lib/sync/programme-clock";
import { FakeAudio, FakeTime } from "../lib/sync/testing/fakes";
import { AudioEngine, type EngineTick } from "./audio-engine";

const programme = Programme.parse(vectors.programme);
const EPOCH = Date.parse(programme.epoch);
const timings0 = Timings.parse(timingsExample);
/** Same programme with a 2-minute first track, for long drift runs inside one track. */
const longProgramme = Programme.parse({
  ...vectors.programme,
  tracks: vectors.programme.tracks.map((t, i) => (i === 0 ? { ...t, durationMs: 120_000 } : t)),
});

interface SetupOptions {
  /** Server-time position in the programme at t = 0 of the test. */
  startOffsetMs: number;
  outputLatencyMs?: number;
  rateMax?: number;
  autoReadyMs?: number | null;
  autoPlaying?: boolean;
  autoSeeked?: boolean;
  seekFreezeMs?: number;
  long?: boolean;
}

const OFFSET = 1000; // server − local

function setup(o: SetupOptions) {
  const compiled = compileProgramme(o.long ? longProgramme : programme);
  const time = new FakeTime(EPOCH + o.startOffsetMs - OFFSET);
  const clockSync = new ClockSync();
  clockSync.acceptBurst([{ c0: 0, s: OFFSET + 50, c1: 100 }]);
  const programmeClock = new ProgrammeClock({ compiled, clockSync, now: time.now });
  const audios: FakeAudio[] = [];
  const ticks: EngineTick[] = [];
  const onPlaying = vi.fn();
  const onTrackChange = vi.fn();
  const engine = new AudioEngine({
    programmeClock,
    compiled,
    getTimings: (i) => (i === 0 ? timings0 : undefined),
    createAudio: () => {
      const a = new FakeAudio({ time, autoReadyMs: o.autoReadyMs ?? null, autoPlaying: o.autoPlaying ?? false,
        autoSeeked: o.autoSeeked ?? true,
        seekFreezeMs: o.seekFreezeMs,
      });
      audios.push(a);
      return a;
    },
    outputLatencyMs: o.outputLatencyMs ?? 0,
    rateMax: o.rateMax ?? 0.02,
    deps: time,
    onPlaying,
    onTick: (t) => ticks.push(t),
    onTrackChange,
  });
  const target = () => programmeClock.target();
  const current = () => engine.currentElement as FakeAudio;
  return { time, engine, audios, ticks, onPlaying, onTrackChange, target, current };
}

type Ctx = ReturnType<typeof setup>;
const lastErr = (c: Ctx) => c.ticks.at(-1)!.errMs;

/** Start with auto-ready/auto-playing audio and let it settle. */
function started(o: SetupOptions): Ctx {
  const c = setup({ autoReadyMs: 0, autoPlaying: true, ...o });
  c.engine.start();
  c.time.advance(10);
  return c;
}

describe("AudioEngine", () => {
  it("loads the target track, seeks to the recomputed target after canplay, plays and reports playing", () => {
    const c = setup({ startOffsetMs: 10_000 });
    c.engine.start();
    const [a, b] = c.audios;
    expect(a!.src).toBe("/dev-audio/001.wav");
    expect(a!.preservesPitch).toBe(true);
    expect(b!.preservesPitch).toBe(true);
    expect(a!.playCalls).toBe(0);
    c.time.advance(700); // loading takes 700 ms
    a!.dispatch("canplay");
    expect(a!.seeks).toEqual([10.7]);
    expect(a!.playCalls).toBe(1);
    expect(c.onPlaying).not.toHaveBeenCalled();
    a!.dispatch("playing");
    expect(c.onPlaying).toHaveBeenCalledTimes(1);
    expect(c.onTrackChange).toHaveBeenCalledWith(0);
  });

  it("corrects drift with playbackRate, without seeking", () => {
    const c = started({ startOffsetMs: 5_000, long: true });
    const a = c.current();
    a.currentTimeValue += 0.5;
    for (let i = 0; i < 60; i++) c.time.advance(1000);
    expect(Math.abs(lastErr(c))).toBeLessThan(40);
    expect(a.seeks).toHaveLength(1);
    expect(a.playbackRate).toBe(1);
    expect(Math.min(...a.rateHistory)).toBeCloseTo(0.98, 10);
  });

  it("corrects drift in the other direction", () => {
    const c = started({ startOffsetMs: 5_000, long: true });
    const a = c.current();
    a.currentTimeValue -= 0.3;
    for (let i = 0; i < 60; i++) c.time.advance(1000);
    expect(Math.abs(lastErr(c))).toBeLessThan(40);
    expect(a.seeks).toHaveLength(1);
    expect(Math.max(...a.rateHistory)).toBeCloseTo(1.02, 10);
  });

  it("does not keep changing the rate when currentTime reads are noisy", () => {
    const c = started({ startOffsetMs: 5_000, long: true });
    const a = c.current();
    // Some browsers report currentTime tens of ms off; model ±80 ms of jitter.
    const jitter = [0.06, -0.07, 0.08, -0.05, 0.03];
    let n = 0;
    Object.defineProperty(a, "currentTime", {
      get: () => a.currentTimeValue + jitter[n++ % jitter.length]!,
      set: (v: number) => {
        a.currentTimeValue = v;
      },
    });
    const before = a.rateHistory.length;
    for (let i = 0; i < 60; i++) c.time.advance(1000);
    expect(a.rateHistory.length - before).toBe(0);
    expect(a.seeks).toHaveLength(1);
  });

  it("recovers a short stall with the rate instead of a seek", () => {
    const c = started({ startOffsetMs: 5_000, long: true });
    const a = c.current();
    c.time.advance(3000);
    a.dispatch("waiting");
    c.time.advance(200);
    a.dispatch("playing");
    for (let i = 0; i < 30; i++) c.time.advance(1000);
    expect(a.seeks).toHaveLength(1);
    expect(Math.max(...a.rateHistory)).toBeCloseTo(1.02, 10);
    expect(Math.abs(lastErr(c))).toBeLessThan(40);
  });

  it("does not loop on seeks when the element takes over a second to resume after each seek", () => {
    // iOS Safari: after a seek the playhead stands still ~1.4 s with no `waiting` event.
    const c = started({ startOffsetMs: 5_000, long: true, seekFreezeMs: 1400 });
    const a = c.current();
    for (let i = 0; i < 60; i++) c.time.advance(1000);
    expect(a.seeks.length).toBeLessThanOrEqual(2);
    expect(Math.abs(lastErr(c))).toBeLessThan(100);
  });

  it("keeps the element ahead of the target by the output latency", () => {
    const c = started({ startOffsetMs: 5_000, outputLatencyMs: 100, long: true });
    for (let i = 0; i < 10; i++) c.time.advance(1000);
    const a = c.current();
    expect(a.currentTime * 1000 - c.target().posInTrackMs).toBeCloseTo(100, 6);
    expect(Math.abs(lastErr(c))).toBeLessThan(1);
    expect(a.seeks).toHaveLength(1);
  });

  it("hard-seeks exactly once on a large error", () => {
    const c = started({ startOffsetMs: 5_000, long: true });
    const a = c.current();
    a.currentTimeValue += 1.5;
    for (let i = 0; i < 10; i++) c.time.advance(1000);
    expect(a.seeks).toHaveLength(2);
    expect(Math.abs(lastErr(c))).toBeLessThan(1);
  });

  it("seeks once to the new target after a stall", () => {
    const c = started({ startOffsetMs: 5_000, long: true });
    const a = c.current();
    c.time.advance(3000);
    a.dispatch("waiting");
    c.time.advance(2000);
    expect(a.seeks).toHaveLength(1);
    a.dispatch("playing");
    expect(a.seeks).toHaveLength(2);
    expect(a.seeks[1]! * 1000).toBeCloseTo(c.target().posInTrackMs, 6);
    c.time.advance(5000);
    expect(a.seeks).toHaveLength(2);
    expect(c.onPlaying).toHaveBeenCalledTimes(1);
  });

  it("does not treat buffering caused by its own seek as a stall", () => {
    const c = started({ startOffsetMs: 5_000, long: true, autoSeeked: false });
    const a = c.current();
    a.dispatch("seeked"); // the initial seek completes
    a.currentTimeValue += 1.5;
    c.time.advance(1000);
    expect(a.seeks).toHaveLength(2);
    a.dispatch("waiting");
    c.time.advance(300);
    a.dispatch("seeked");
    a.dispatch("playing");
    c.time.advance(5000);
    expect(a.seeks).toHaveLength(2);
    expect(Math.abs(lastErr(c))).toBeLessThan(300);
  });

  it("preloads the next track once, 30 s before the boundary", () => {
    const c = started({ startOffsetMs: 25_000 });
    const next = c.audios[1]!;
    c.time.advance(4000); // 31 s left
    expect(next.src).toBe("");
    c.time.advance(2000);
    expect(next.src).toBe("/dev-audio/002.wav");
    expect(next.loadCalls).toBe(1);
    c.time.advance(10_000);
    expect(next.loadCalls).toBe(1);
    expect(next.paused).toBe(true);
  });

  it("swaps elements at track boundaries, including the loop back to the first track", () => {
    const c = started({ startOffsetMs: 55_000 });
    const [a, b] = c.audios as [FakeAudio, FakeAudio];
    expect(c.current()).toBe(a);
    c.time.advance(5000); // cross into track 1 at 60 s
    expect(c.current()).toBe(b);
    expect(a.paused).toBe(true);
    expect(b.paused).toBe(false);
    expect(b.seeks).toHaveLength(1);
    expect(b.seeks[0]! * 1000).toBeLessThan(5);
    expect(c.onTrackChange).toHaveBeenLastCalledWith(1);
    c.time.advance(45_000); // track 2
    expect(c.current()).toBe(a);
    expect(a.src).toBe("/dev-audio/003.wav");
    expect(b.paused).toBe(true);
    expect(c.onTrackChange).toHaveBeenLastCalledWith(2);
    c.time.advance(30_000); // loop to track 0
    expect(c.current()).toBe(b);
    expect(b.src).toBe("/dev-audio/001.wav");
    expect(c.onTrackChange).toHaveBeenLastCalledWith(0);
    c.time.advance(3000);
    expect(c.ticks.at(-1)!.trackIndex).toBe(0);
    expect(Math.abs(lastErr(c))).toBeLessThan(40);
  });

  it("loads the target directly when the boundary arrives before a preload finished", () => {
    const c = setup({ startOffsetMs: 55_000, autoReadyMs: null, autoPlaying: true });
    c.engine.start();
    const [a, b] = c.audios as [FakeAudio, FakeAudio];
    a.dispatch("canplay");
    c.time.advance(5000);
    // b was asked to preload but never became ready: it is still the one we wait on.
    expect(c.current()).toBe(b);
    expect(b.playCalls).toBe(0);
    c.time.advance(400);
    b.dispatch("canplay");
    expect(b.playCalls).toBe(1);
    expect(b.seeks.at(-1)! * 1000).toBeCloseTo(c.target().posInTrackMs, 6);
  });

  it("with rateMax = 0 never changes the rate and seeks only in a gap", () => {
    const c = started({ startOffsetMs: 4_500, rateMax: 0 });
    const a = c.current();
    a.currentTimeValue += 0.5;
    for (let i = 0; i < 300; i++) c.time.advance(100);
    expect(a.rateHistory).toEqual([]);
    expect(a.seeks).toHaveLength(2);
    const at = a.seekTimes[1]!;
    const pos = at + OFFSET - EPOCH;
    expect(isInGap(timings0.segments, pos)).toBe(true);
    expect(Math.abs(lastErr(c))).toBeLessThan(40);
  });

  it("stop() pauses and clears its timers", () => {
    const c = started({ startOffsetMs: 5_000, autoReadyMs: null });
    c.current().dispatch("canplay");
    c.time.advance(2000);
    c.engine.stop();
    const n = c.ticks.length;
    expect(c.audios.every((a) => a.paused)).toBe(true);
    expect(c.time.pending).toBe(0);
    c.time.advance(10_000);
    expect(c.ticks.length).toBe(n);
  });

  it("correctNow() runs a correction tick immediately", () => {
    const c = started({ startOffsetMs: 5_000, long: true });
    c.time.advance(500);
    const n = c.ticks.length;
    c.current().currentTimeValue += 2;
    c.engine.correctNow();
    expect(c.ticks.length).toBe(n + 1);
    expect(c.current().seeks).toHaveLength(2);
  });
});

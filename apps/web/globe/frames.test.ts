import { describe, expect, it } from "vitest";
import { FakeTime } from "../lib/sync/testing/fakes";
import { AUTO_ROTATE_SPEED, FRAME_INTERVAL_MS, FrameDriver, MAX_FRAME_STEP_MS, SETTLE_MS, autoRotateAngle } from "./frames";

function setup() {
  const time = new FakeTime(1000);
  const frames: number[] = [];
  const driver = new FrameDriver({
    onFrame: (dtMs) => frames.push(dtMs),
    deps: { now: time.now, setInterval: time.setInterval, clearInterval: time.clearInterval },
  });
  return { time, frames, driver };
}

describe("autoRotateAngle", () => {
  it("matches OrbitControls' per-frame angle at 60 fps, whatever the frame rate", () => {
    const perFrameAt60 = ((2 * Math.PI) / 60 / 60) * AUTO_ROTATE_SPEED;
    expect(autoRotateAngle(1000 / 60)).toBeCloseTo(perFrameAt60, 12);
    expect(autoRotateAngle(FRAME_INTERVAL_MS)).toBeCloseTo(2 * perFrameAt60, 12);
    // One full turn every 60 / speed seconds.
    expect(autoRotateAngle(50) * ((60 / AUTO_ROTATE_SPEED) * 1000 / 50)).toBeCloseTo(2 * Math.PI, 9);
  });

  it("caps a long gap so the globe never jumps", () => {
    expect(autoRotateAngle(5000)).toBe(autoRotateAngle(MAX_FRAME_STEP_MS));
    expect(autoRotateAngle(0)).toBe(0);
  });
});

describe("FrameDriver", () => {
  it("requests nothing until asked", () => {
    const c = setup();
    c.time.advance(10_000);
    expect(c.frames).toEqual([]);
    expect(c.time.pending).toBe(0);
  });

  it("while continuous, requests frames at the capped rate with the elapsed time", () => {
    const c = setup();
    c.driver.setContinuous(true);
    expect(c.frames).toEqual([0]); // one frame straight away
    c.time.advance(1000);
    expect(c.frames.length).toBe(1 + 30);
    expect(c.frames.slice(1).every((dt) => Math.abs(dt - FRAME_INTERVAL_MS) < 1)).toBe(true);
    expect(c.driver.running).toBe(true);
  });

  it("settles for a short while after continuous turns off, then stops", () => {
    const c = setup();
    c.driver.setContinuous(true);
    c.time.advance(500);
    c.driver.setContinuous(false);
    const n = c.frames.length;
    c.time.advance(SETTLE_MS + FRAME_INTERVAL_MS);
    expect(c.frames.length).toBeGreaterThan(n);
    expect(c.driver.running).toBe(false);
    const stopped = c.frames.length;
    c.time.advance(10_000);
    expect(c.frames.length).toBe(stopped);
    expect(c.time.pending).toBe(0);
  });

  it("kick() renders for the given time only (a data change)", () => {
    const c = setup();
    c.driver.kick(1500);
    c.time.advance(1500 + FRAME_INTERVAL_MS);
    const n = c.frames.length;
    expect(n).toBeGreaterThanOrEqual(1 + 45);
    expect(n).toBeLessThanOrEqual(1 + 46);
    c.time.advance(10_000);
    expect(c.frames.length).toBe(n);
    expect(c.driver.running).toBe(false);
  });

  it("a kick extends, never shortens, the current window, and does not restart the ticker", () => {
    const c = setup();
    c.driver.kick(1000);
    c.time.advance(100);
    c.driver.kick(100);
    const pendingBefore = c.time.pending;
    c.time.advance(900 + FRAME_INTERVAL_MS);
    expect(c.driver.running).toBe(false);
    expect(pendingBefore).toBe(1);
    expect(c.frames.filter((dt) => dt === 0)).toHaveLength(1);
  });

  it("dispose() stops everything and ignores later calls", () => {
    const c = setup();
    c.driver.setContinuous(true);
    c.time.advance(100);
    c.driver.dispose();
    c.driver.kick(1000);
    c.driver.setContinuous(true);
    const n = c.frames.length;
    c.time.advance(10_000);
    expect(c.frames.length).toBe(n);
    expect(c.time.pending).toBe(0);
  });
});

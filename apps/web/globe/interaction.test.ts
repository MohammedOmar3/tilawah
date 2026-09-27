import { describe, expect, it } from "vitest";
import {
  AUTO_ROTATE_IDLE_MS,
  MAX_DISTANCE,
  MAX_TILT_DEG,
  MIN_DISTANCE,
  autoRotateEnabled,
  clampDistance,
  clampTilt,
  keyToAction,
} from "./interaction";

describe("autoRotateEnabled", () => {
  const now = 1_000_000;

  it("is off under reduced motion", () => {
    expect(autoRotateEnabled({ reducedMotion: true, lastInteractionAt: null, now })).toBe(false);
  });

  it("is off within 10 s of the last interaction", () => {
    expect(AUTO_ROTATE_IDLE_MS).toBe(10_000);
    expect(autoRotateEnabled({ reducedMotion: false, lastInteractionAt: now - 9_999, now })).toBe(false);
    expect(autoRotateEnabled({ reducedMotion: false, lastInteractionAt: now, now })).toBe(false);
  });

  it("is on otherwise", () => {
    expect(autoRotateEnabled({ reducedMotion: false, lastInteractionAt: null, now })).toBe(true);
    expect(autoRotateEnabled({ reducedMotion: false, lastInteractionAt: now - 10_000, now })).toBe(true);
  });
});

describe("keyToAction", () => {
  it.each([
    ["ArrowLeft", { type: "rotate", degrees: -15 }],
    ["ArrowRight", { type: "rotate", degrees: 15 }],
    ["ArrowUp", { type: "tilt", degrees: 10 }],
    ["ArrowDown", { type: "tilt", degrees: -10 }],
    ["+", { type: "zoom", direction: "in" }],
    ["=", { type: "zoom", direction: "in" }],
    ["-", { type: "zoom", direction: "out" }],
    ["0", { type: "reset" }],
  ] as const)("maps %s", (key, action) => {
    expect(keyToAction(key)).toEqual(action);
  });

  it.each(["a", "Enter", " ", "Tab", "1", "Escape"])("ignores %j", (key) => {
    expect(keyToAction(key)).toBeNull();
  });
});

describe("clampTilt", () => {
  it("keeps the tilt within ±60°", () => {
    expect(MAX_TILT_DEG).toBe(60);
    expect(clampTilt(75)).toBe(60);
    expect(clampTilt(-75)).toBe(-60);
    expect(clampTilt(20)).toBe(20);
  });
});

describe("clampDistance", () => {
  it("keeps the camera between 180 and 500 (globe radius is 100)", () => {
    expect(MIN_DISTANCE).toBe(180);
    expect(MAX_DISTANCE).toBe(500);
    expect(clampDistance(100)).toBe(180);
    expect(clampDistance(900)).toBe(500);
    expect(clampDistance(320)).toBe(320);
  });
});

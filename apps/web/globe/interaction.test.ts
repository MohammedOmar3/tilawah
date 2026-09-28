import { describe, expect, it } from "vitest";
import {
  AUTO_ROTATE_IDLE_MS,
  MAX_TILT_DEG,
  MAX_ZOOM,
  MIN_ZOOM,
  autoRotateEnabled,
  clampZoom,
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

describe("clampZoom", () => {
  it("keeps the zoom between 0.6× and 1.8× the view's globe size", () => {
    expect(MIN_ZOOM).toBe(0.6);
    expect(MAX_ZOOM).toBe(1.8);
    expect(clampZoom(0.1)).toBe(0.6);
    expect(clampZoom(4)).toBe(1.8);
    expect(clampZoom(1.2)).toBe(1.2);
  });
});

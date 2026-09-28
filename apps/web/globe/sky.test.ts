import { describe, expect, it } from "vitest";
import { SkyPainter, type SkyColours, type SkyView } from "./sky";

/** A small seeded generator so the sky is the same in every run. */
function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function fakeContext() {
  const calls = { stars: 0, clouds: 0, alphas: [] as number[] };
  const ctx = {
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "",
    clearRect: () => undefined,
    fillRect(_x: number, _y: number, w: number) {
      if (w > 20) calls.clouds++;
      else {
        calls.stars++;
        calls.alphas.push(ctx.globalAlpha);
      }
    },
    beginPath: () => undefined,
    arc: () => undefined,
    fill() {
      calls.stars++;
    },
    createRadialGradient: () => ({ addColorStop: () => undefined }),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, raw: ctx };
}

const view: SkyView = { width: 800, height: 600, pixelRatio: 1, cx: 400, cy: 300, rotY: 0, rotX: 0, time: 0, fovDeg: 30 };
const colours: SkyColours = {
  stars: ["#ffffff", "#ffd98a", "#8fb8ff"],
  starAlpha: 1,
  additive: true,
  clouds: ["#1f4796", "#4b2d85", "#0e6173"],
  cloudAlpha: 0.55,
  twinkle: false,
};

describe("SkyPainter", () => {
  it("builds two star layers", () => {
    expect(new SkyPainter(seeded()).starCount).toBe(7800);
    expect(new SkyPainter(seeded(), 0.5).starCount).toBe(3900);
  });

  it("draws the stars in view and restores the context", () => {
    const { ctx, calls, raw } = fakeContext();
    new SkyPainter(seeded()).paint(ctx, view, colours);
    expect(calls.stars).toBeGreaterThan(20);
    expect(calls.stars).toBeLessThan(7800);
    expect(raw.globalAlpha).toBe(1);
    expect(raw.globalCompositeOperation).toBe("source-over");
  });

  it("is still without twinkle, and turns with the globe", () => {
    const painter = new SkyPainter(seeded());
    const a = fakeContext();
    const b = fakeContext();
    painter.paint(a.ctx, { ...view, time: 0 }, colours);
    painter.paint(b.ctx, { ...view, time: 5 }, colours);
    expect(b.calls.alphas).toEqual(a.calls.alphas);
    const c = fakeContext();
    painter.paint(c.ctx, { ...view, rotY: 1.2 }, colours);
    expect(c.calls.alphas).not.toEqual(a.calls.alphas);
  });
});

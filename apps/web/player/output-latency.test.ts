import { describe, expect, it, vi } from "vitest";
import { probeOutputLatencyMs } from "./output-latency";

function ctx(outputLatency: number | undefined, baseLatency: number | undefined) {
  return { outputLatency, baseLatency, close: vi.fn(() => Promise.resolve()) };
}

describe("probeOutputLatencyMs", () => {
  it("prefers outputLatency and closes the context", () => {
    const c = ctx(0.1, 0.01);
    expect(probeOutputLatencyMs(() => c)).toBeCloseTo(100, 10);
    expect(c.close).toHaveBeenCalledTimes(1);
  });
  it("falls back to baseLatency", () => {
    expect(probeOutputLatencyMs(() => ctx(0, 0.02))).toBeCloseTo(20, 10);
    expect(probeOutputLatencyMs(() => ctx(undefined, 0.02))).toBeCloseTo(20, 10);
  });
  it("returns 0 when neither is known", () => {
    expect(probeOutputLatencyMs(() => ctx(undefined, undefined))).toBe(0);
  });
  it("returns 0 if the factory is missing or throws", () => {
    expect(probeOutputLatencyMs(undefined)).toBe(0);
    expect(
      probeOutputLatencyMs(() => {
        throw new Error("no audio");
      }),
    ).toBe(0);
  });
  it("survives a close() that rejects or throws", () => {
    const rejects = { outputLatency: 0.05, close: () => Promise.reject(new Error("x")) };
    expect(probeOutputLatencyMs(() => rejects)).toBeCloseTo(50, 10);
    const throws = {
      outputLatency: 0.05,
      close: () => {
        throw new Error("x");
      },
    };
    expect(probeOutputLatencyMs(() => throws)).toBeCloseTo(50, 10);
  });
});

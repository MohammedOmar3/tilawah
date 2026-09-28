import vectors from "@tilawah/contracts/fixtures/timing-vectors.json";
import { describe, expect, it } from "vitest";
import { decide, isInGap, median, nextGap, type DriftInput } from "./drift";

describe("decide", () => {
  const base = { rateMax: 0.02, inGap: false, stalled: false, rate: 1 };
  const rows: Array<[DriftInput, ReturnType<typeof decide>]> = [
    // At normal speed: ignore anything within ±100 ms (measurement noise).
    [{ ...base, errMs: 20 }, { kind: "hold", rate: 1 }],
    [{ ...base, errMs: -99 }, { kind: "hold", rate: 1 }],
    // Beyond it, correct at one fixed rate, not a rate that changes every tick.
    [{ ...base, errMs: 101 }, { kind: "rate", rate: 0.98 }],
    [{ ...base, errMs: 900 }, { kind: "rate", rate: 0.98 }],
    [{ ...base, errMs: -200 }, { kind: "rate", rate: 1.02 }],
    // While correcting: keep the same rate until err is back within 20 ms or overshoots.
    [{ ...base, rate: 0.98, errMs: 60 }, { kind: "rate", rate: 0.98 }],
    [{ ...base, rate: 0.98, errMs: 15 }, { kind: "hold", rate: 1 }],
    [{ ...base, rate: 0.98, errMs: -30 }, { kind: "hold", rate: 1 }],
    [{ ...base, rate: 1.02, errMs: -60 }, { kind: "rate", rate: 1.02 }],
    [{ ...base, rate: 1.02, errMs: 30 }, { kind: "hold", rate: 1 }],
    // Seeks: large errors, and stalls that left us more than 250 ms behind or ahead.
    [{ ...base, errMs: 1200 }, { kind: "seek" }],
    [{ ...base, errMs: -1200 }, { kind: "seek" }],
    [{ ...base, errMs: -300, stalled: true }, { kind: "seek" }],
    [{ ...base, errMs: -200, stalled: true }, { kind: "rate", rate: 1.02 }],
    [{ ...base, errMs: 50, stalled: true }, { kind: "hold", rate: 1 }],
    // rateMax = 0: never change the rate; seek in a gap once beyond ±100 ms.
    [{ ...base, rateMax: 0, errMs: 200 }, { kind: "hold", rate: 1 }],
    [{ ...base, rateMax: 0, errMs: 200, inGap: true }, { kind: "seek" }],
    [{ ...base, rateMax: 0, errMs: 60, inGap: true }, { kind: "hold", rate: 1 }],
    [{ ...base, rateMax: 0, errMs: 1200 }, { kind: "seek" }],
  ];
  it.each(rows)("%o → %o", (input, expected) => {
    const got = decide(input);
    expect(got.kind).toBe(expected.kind);
    if (expected.kind !== "seek" && got.kind !== "seek") expect(got.rate).toBeCloseTo(expected.rate, 12);
  });
});

describe("median", () => {
  it("returns the middle value (mean of the middle two for even counts)", () => {
    expect(median([5])).toBe(5);
    expect(median([300, -10, 20])).toBe(20);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("isInGap", () => {
  it("is false inside a segment and true between, before and after segments", () => {
    const seg = vectors.withIntro.segments;
    expect(isInGap(seg, 0)).toBe(false);
    expect(isInGap(seg, 3999)).toBe(false);
    expect(isInGap(seg, 4000)).toBe(true);
    expect(isInGap(seg, 4199)).toBe(true);
    expect(isInGap(seg, 4200)).toBe(false);
    expect(isInGap(seg, 9000)).toBe(false);
    expect(isInGap(seg, 15200)).toBe(true);
    expect(isInGap(seg, 15500)).toBe(false);
    expect(isInGap(seg, 20000)).toBe(true);
    expect(isInGap(seg, 25000)).toBe(true);
    expect(isInGap(vectors.noIntro.segments, 100)).toBe(true);
    expect(isInGap(vectors.noIntro.segments, 500)).toBe(false);
  });
});

describe("nextGap", () => {
  it("finds the next silence at or after a position", () => {
    const seg = vectors.withIntro.segments;
    expect(nextGap(seg, 0)).toEqual({ startMs: 4000, endMs: 4200 });
    expect(nextGap(seg, 4100)).toEqual({ startMs: 4000, endMs: 4200 });
    expect(nextGap(seg, 5000)).toEqual({ startMs: 15000, endMs: 15500 });
    expect(nextGap(seg, 16000)).toEqual({ startMs: 20000, endMs: Infinity });
    expect(nextGap(vectors.noIntro.segments, 0)).toEqual({ startMs: 0, endMs: 500 });
  });
});

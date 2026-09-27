import vectors from "@tilawah/contracts/fixtures/timing-vectors.json";
import { describe, expect, it } from "vitest";
import { decide, isInGap, nextGap, type DriftInput } from "./drift";

describe("decide", () => {
  const rows: Array<[DriftInput, ReturnType<typeof decide>]> = [
    [{ errMs: 20, rateMax: 0.02, inGap: false, stalled: false }, { kind: "hold", rate: 1 }],
    [{ errMs: -39, rateMax: 0.02, inGap: false, stalled: false }, { kind: "hold", rate: 1 }],
    [{ errMs: 200, rateMax: 0.02, inGap: false, stalled: false }, { kind: "rate", rate: 0.98 }],
    [{ errMs: 60, rateMax: 0.02, inGap: false, stalled: false }, { kind: "rate", rate: 0.985 }],
    [{ errMs: -200, rateMax: 0.02, inGap: false, stalled: false }, { kind: "rate", rate: 1.02 }],
    [{ errMs: 1200, rateMax: 0.02, inGap: false, stalled: false }, { kind: "seek" }],
    [{ errMs: -1200, rateMax: 0.02, inGap: false, stalled: false }, { kind: "seek" }],
    [{ errMs: 50, rateMax: 0.02, inGap: false, stalled: true }, { kind: "seek" }],
    [{ errMs: 200, rateMax: 0, inGap: false, stalled: false }, { kind: "hold", rate: 1 }],
    [{ errMs: 200, rateMax: 0, inGap: true, stalled: false }, { kind: "seek" }],
    [{ errMs: 20, rateMax: 0, inGap: true, stalled: false }, { kind: "hold", rate: 1 }],
    [{ errMs: 1200, rateMax: 0, inGap: false, stalled: false }, { kind: "seek" }],
  ];
  it.each(rows)("%o → %o", (input, expected) => {
    const got = decide(input);
    expect(got.kind).toBe(expected.kind);
    if (expected.kind !== "seek" && got.kind !== "seek") expect(got.rate).toBeCloseTo(expected.rate, 12);
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

import { Timings, ayahAt } from "@tilawah/contracts";
import { describe, expect, it } from "vitest";
import { DEV_RECITER_ID, GAP_MS, INTRO_MS, devTimings } from "./dev-timings";

describe("devTimings", () => {
  it("starts with a 3 s intro segment when intro is true", () => {
    const t = devTimings({ surah: 112, ayahCount: 4, durationMs: 45000, intro: true });
    expect(t.segments[0]).toEqual({ ayah: 0, startMs: 0, endMs: INTRO_MS });
    expect(INTRO_MS).toBe(3000);
    expect(t.segments).toHaveLength(5);
    expect(t.reciter).toBe(DEV_RECITER_ID);
    expect(t.surah).toBe(112);
  });

  it("has no intro segment when intro is false", () => {
    const t = devTimings({ surah: 1, ayahCount: 7, durationMs: 60000, intro: false });
    expect(t.segments).toHaveLength(7);
    expect(t.segments[0]!.ayah).toBe(1);
    expect(t.segments[0]!.startMs).toBe(0);
  });

  it.each([
    { surah: 1, ayahCount: 7, durationMs: 60000, intro: false },
    { surah: 112, ayahCount: 4, durationMs: 45000, intro: true },
    { surah: 113, ayahCount: 5, durationMs: 30000, intro: true },
    { surah: 2, ayahCount: 286, durationMs: 100003, intro: true },
  ])("shares time equally with 300 ms gaps: $surah", (opts) => {
    const t = devTimings(opts);
    const ayahs = t.segments.filter((s) => s.ayah > 0);
    expect(ayahs.map((s) => s.ayah)).toEqual(Array.from({ length: opts.ayahCount }, (_, i) => i + 1));
    const slot = ayahs[1]!.startMs - ayahs[0]!.startMs;
    for (let i = 0; i < ayahs.length; i++) {
      const s = ayahs[i]!;
      expect(Number.isInteger(s.startMs) && Number.isInteger(s.endMs)).toBe(true);
      if (i > 0) expect(s.startMs - ayahs[i - 1]!.startMs).toBe(slot);
      if (i < ayahs.length - 1) {
        expect(s.endMs - s.startMs).toBe(slot - GAP_MS);
        expect(ayahs[i + 1]!.startMs - s.endMs).toBe(GAP_MS);
      }
    }
    expect(ayahs.at(-1)!.endMs).toBe(opts.durationMs);
  });

  it("passes the Timings schema and ayahAt finds every ayah at its start", () => {
    const t = Timings.parse(devTimings({ surah: 113, ayahCount: 5, durationMs: 30000, intro: true }));
    expect(ayahAt(t.segments, 0)).toBe(0);
    for (const s of t.segments) expect(ayahAt(t.segments, s.startMs)).toBe(s.ayah);
    for (let a = 1; a <= 5; a++) expect(t.segments.some((s) => s.ayah === a)).toBe(true);
  });
});

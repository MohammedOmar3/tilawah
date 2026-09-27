import type { Programme, Surah, Timings } from "@tilawah/contracts";
import { describe, expect, it } from "vitest";
import { validateProgramme } from "./validate";

const surah = (number: number, ayahCount: number): Surah => ({
  number,
  nameArabic: "س",
  nameTransliterated: `S${number}`,
  nameEnglish: `S${number}`,
  ayahCount,
  revelation: "meccan",
});
const surahs: Surah[] = Array.from({ length: 114 }, (_, i) => surah(i + 1, 3));

const track = (s: number, durationMs = 10000) => ({
  surah: s,
  durationMs,
  audio: `/a/${s}.wav`,
  timings: `/t/${s}.json`,
});
const programme = (tracks: Programme["tracks"]): Programme => ({
  version: "v",
  epoch: "2026-09-01T00:00:00Z",
  reciter: { id: "dev-tone", name: "Dev", riwayah: "hafs" },
  tracks,
});
const timings = (s: number, endMs = 10000, lastAyah = 3): Timings => ({
  surah: s,
  reciter: "dev-tone",
  segments: [
    { ayah: 0, startMs: 0, endMs: 1000 },
    { ayah: 1, startMs: 1000, endMs: 4000 },
    { ayah: 2, startMs: 4000, endMs: 7000 },
    { ayah: lastAyah, startMs: 7000, endMs },
  ],
});

describe("validateProgramme", () => {
  it("accepts a consistent dev programme", () => {
    const p = programme([track(1), track(112)]);
    const t = new Map([[1, timings(1)], [112, timings(112)]]);
    expect(validateProgramme(p, surahs, t)).toEqual([]);
  });

  it("flags a segment ayah beyond the surah's ayahCount", () => {
    const errs = validateProgramme(programme([track(1)]), surahs, new Map([[1, timings(1, 10000, 4)]]));
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/ayah 4/);
  });

  it("flags a last segment ending after the track duration", () => {
    const errs = validateProgramme(programme([track(1, 9000)]), surahs, new Map([[1, timings(1, 10000)]]));
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/durationMs/);
  });

  it("flags a timings file for the wrong surah", () => {
    const errs = validateProgramme(programme([track(1)]), surahs, new Map([[1, timings(2)]]));
    expect(errs.some((e) => /surah 2/.test(e))).toBe(true);
  });

  it("flags missing timings", () => {
    expect(validateProgramme(programme([track(1)]), surahs, new Map())).toEqual([expect.stringMatching(/no timings/)]);
  });

  it("in production, requires surahs 1 to 114 in order", () => {
    const partial = programme([track(1), track(112)]);
    const t = new Map(surahs.map((s) => [s.number, timings(s.number)] as const));
    expect(validateProgramme(partial, surahs, t, { production: true }).some((e) => /1 to 114/.test(e))).toBe(true);

    const full = programme(surahs.map((s) => track(s.number)));
    expect(validateProgramme(full, surahs, t, { production: true })).toEqual([]);

    const swapped = programme(surahs.map((s) => track(s.number)));
    [swapped.tracks[0], swapped.tracks[1]] = [swapped.tracks[1]!, swapped.tracks[0]!];
    expect(validateProgramme(swapped, surahs, t, { production: true }).some((e) => /1 to 114/.test(e))).toBe(true);
  });
});

import { compileProgramme, type Programme } from "@tilawah/contracts";
import { describe, expect, it } from "vitest";
import { formatMinutes, formatSince, recitedTotals } from "./totals";

const programme: Programme = {
  version: "t",
  epoch: "2026-09-28T00:00:00Z",
  reciter: { id: "r", name: "R", riwayah: "hafs" },
  tracks: [
    { surah: 1, durationMs: 60_000, audio: "/a/1", timings: "/t/1" },
    { surah: 2, durationMs: 120_000, audio: "/a/2", timings: "/t/2" },
    { surah: 3, durationMs: 60_000, audio: "/a/3", timings: "/t/3" },
  ],
};
const c = compileProgramme(programme);
const epoch = Date.parse(programme.epoch);

describe("recitedTotals", () => {
  it.each([
    ["before the epoch", -1_000, { recitedMs: 0, surahs: 0, khatms: 0 }],
    ["at the epoch", 0, { recitedMs: 0, surahs: 0, khatms: 0 }],
    ["during the first surah", 59_999, { recitedMs: 59_999, surahs: 0, khatms: 0 }],
    ["once the first surah ends", 60_000, { recitedMs: 60_000, surahs: 1, khatms: 0 }],
    ["after one full khatm", 240_000, { recitedMs: 240_000, surahs: 3, khatms: 1 }],
    ["into the second khatm", 240_000 + 200_000, { recitedMs: 440_000, surahs: 5, khatms: 1 }],
  ])("%s", (_, offset, want) => {
    expect(recitedTotals(c, epoch + offset)).toEqual(want);
  });
});

describe("formatMinutes", () => {
  it.each([
    [0, "0 minutes"],
    [1, "1 minute"],
    [45.9, "45 minutes"],
    [119, "119 minutes"],
    [120, "2 hours"],
    [252_600, "4,210 hours"],
  ])("%d → %s", (m, text) => {
    expect(formatMinutes(m)).toBe(text);
  });
});

describe("formatSince", () => {
  it("formats the UTC date", () => {
    expect(formatSince("2026-09-28T00:00:00Z")).toBe("28 Sep 2026");
    expect(formatSince("2026-10-09T23:30:00-02:00")).toBe("10 Oct 2026");
  });
});

import { describe, expect, it } from "vitest";
import { convertQuranComTimings } from "./timings";

const source = (chapter: number, stamps: [string, number, number][]) => ({
  audio_file: {
    chapter_id: chapter,
    timestamps: stamps.map(([verse_key, timestamp_from, timestamp_to]) => ({ verse_key, timestamp_from, timestamp_to })),
  },
});

describe("convertQuranComTimings", () => {
  it("converts verse timestamps to spec segments", () => {
    const t = convertQuranComTimings(source(18, [["18:1", 500, 17840], ["18:2", 17840, 30210]]), "alafasy");
    expect(t).toEqual({
      surah: 18,
      reciter: "alafasy",
      segments: [
        { ayah: 1, startMs: 500, endMs: 17840 },
        { ayah: 2, startMs: 17840, endMs: 30210 },
      ],
    });
  });

  it("adds an ayah 0 segment when the first verse starts after 1 s", () => {
    const t = convertQuranComTimings(source(18, [["18:1", 5120, 17840]]), "alafasy");
    expect(t.segments[0]).toEqual({ ayah: 0, startMs: 0, endMs: 5120 });
    expect(t.segments[1]).toEqual({ ayah: 1, startMs: 5120, endMs: 17840 });
  });

  it("applies a global offset and clamps at 0", () => {
    const t = convertQuranComTimings(source(1, [["1:1", 200, 6090], ["1:2", 6090, 11680]]), "alafasy", { offsetMs: -300 });
    expect(t.segments).toEqual([
      { ayah: 1, startMs: 0, endMs: 5790 },
      { ayah: 2, startMs: 5790, endMs: 11380 },
    ]);
  });

  it("rejects a verse from another surah", () => {
    expect(() => convertQuranComTimings(source(2, [["2:1", 0, 10], ["3:2", 10, 20]]), "alafasy")).toThrow(/3:2/);
  });

  it("rejects missing ayahs", () => {
    expect(() => convertQuranComTimings(source(2, [["2:1", 0, 10], ["2:3", 10, 20]]), "alafasy")).toThrow(/ayah 2/);
  });

  it("rejects overlaps", () => {
    expect(() => convertQuranComTimings(source(2, [["2:1", 0, 30], ["2:2", 10, 40]]), "alafasy")).toThrow();
  });
});

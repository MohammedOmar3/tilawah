import { Programme } from "@tilawah/contracts";
import { describe, expect, it } from "vitest";
import { buildProgramme, clampTimings } from "./programme";

const reciter = { id: "alafasy", name: "Mishary Rashid Alafasy", riwayah: "hafs" };
const durations = Object.fromEntries(Array.from({ length: 114 }, (_, i) => [String(i + 1).padStart(3, "0"), 60000 + i]));

describe("buildProgramme", () => {
  const p = buildProgramme({
    reciter,
    durations,
    mediaBase: "https://tilawah-media.mxmd.dev",
    keyVersion: "v1",
    epoch: "2026-09-28T00:00:00Z",
    version: "2026-09-28.1",
  });

  it("has 114 tracks in order with absolute audio and root-relative timings", () => {
    expect(p.tracks).toHaveLength(114);
    expect(p.tracks.map((t) => t.surah)).toEqual(Array.from({ length: 114 }, (_, i) => i + 1));
    expect(p.tracks[1]).toEqual({
      surah: 2,
      durationMs: 60001,
      audio: "https://tilawah-media.mxmd.dev/alafasy/v1/002.m4a",
      timings: "/data/timings/alafasy/002.json",
    });
  });

  it("passes the contract schema", () => {
    expect(() => Programme.parse(p)).not.toThrow();
  });

  it("rejects a version not shaped YYYY-MM-DD.N", () => {
    expect(() =>
      buildProgramme({ reciter, durations, mediaBase: "https://m", keyVersion: "v1", epoch: "2026-09-28T00:00:00Z", version: "v1" }),
    ).toThrow(/version/);
  });

  it("rejects a missing duration", () => {
    const { "114": _, ...partial } = durations;
    expect(() =>
      buildProgramme({ reciter, durations: partial, mediaBase: "https://m", keyVersion: "v1", epoch: "2026-09-28T00:00:00Z", version: "2026-09-28.1" }),
    ).toThrow(/114/);
  });
});

describe("clampTimings", () => {
  const t = (endMs: number) => ({ surah: 1, reciter: "alafasy", segments: [{ ayah: 1, startMs: 0, endMs }] });

  it("leaves timings inside the audio alone", () => {
    expect(clampTimings(t(900), 1000)).toEqual({ timings: t(900), clampedMs: 0 });
  });

  it("clamps an overrun under 500 ms", () => {
    expect(clampTimings(t(1400), 1000)).toEqual({ timings: t(1000), clampedMs: 400 });
  });

  it("fails an overrun of 500 ms or more", () => {
    expect(() => clampTimings(t(1500), 1000)).toThrow(/500/);
  });
});

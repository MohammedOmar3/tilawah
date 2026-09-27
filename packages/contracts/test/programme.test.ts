import { describe, expect, it } from "vitest";
import vectors from "../fixtures/programme-vectors.json";
import timingVectors from "../fixtures/timing-vectors.json";
import { ayahAt, compileProgramme, positionAt, Programme } from "../src";

describe("positionAt", () => {
  const compiled = compileProgramme(Programme.parse(vectors.programme));
  it("has the right total", () => expect(compiled.totalMs).toBe(135000));
  for (const c of vectors.cases) {
    it(c.name, () => {
      const p = positionAt(compiled, c.nowMs);
      expect({ trackIndex: p.trackIndex, posInTrackMs: p.posInTrackMs, loop: p.loop }).toEqual({
        trackIndex: c.trackIndex,
        posInTrackMs: c.posInTrackMs,
        loop: c.loop,
      });
    });
  }
  it("reports ms until the next track", () => {
    expect(positionAt(compiled, 1788220800000 + 50000).msToNextTrack).toBe(10000);
  });
});

describe("ayahAt", () => {
  for (const [name, set] of Object.entries(timingVectors)) {
    for (const c of set.cases) {
      it(`${name} @${c.posMs}`, () => expect(ayahAt(set.segments, c.posMs)).toBe(c.ayah));
    }
  }
});

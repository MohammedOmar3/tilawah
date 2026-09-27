import { compileProgramme, positionAt, Programme } from "@tilawah/contracts";
import vectors from "@tilawah/contracts/fixtures/programme-vectors.json";
import { describe, expect, it } from "vitest";
import { ClockSync } from "./clock-sync";
import { ProgrammeClock } from "./programme-clock";

const compiled = compileProgramme(Programme.parse(vectors.programme));

function syncedAt(offset: number): ClockSync {
  const cs = new ClockSync();
  cs.acceptBurst([{ c0: 0, s: offset + 50, c1: 100 }]);
  return cs;
}

describe("ProgrammeClock", () => {
  it("targets the programme position at server time", () => {
    const clock = new ProgrammeClock({ compiled, clockSync: syncedAt(1000), now: () => 0 });
    for (const v of vectors.cases) {
      const localNow = v.nowMs - 1000;
      const t = clock.target(localNow);
      expect(t).toMatchObject({ ...positionAt(compiled, v.nowMs), approximate: false });
      expect(t.trackIndex).toBe(v.trackIndex);
      expect(t.posInTrackMs).toBe(v.posInTrackMs);
      expect(t.serverNowMs).toBe(v.nowMs);
    }
  });

  it("uses the injected now() by default", () => {
    const clock = new ProgrammeClock({ compiled, clockSync: syncedAt(1000), now: () => 1788220859000 });
    expect(clock.target().trackIndex).toBe(1);
    expect(clock.target().posInTrackMs).toBe(0);
  });

  it("uses the local clock, flagged approximate, before sync", () => {
    const clock = new ProgrammeClock({ compiled, clockSync: new ClockSync(), now: () => 0 });
    const t = clock.target(1788220860000);
    expect(t.approximate).toBe(true);
    expect(t.trackIndex).toBe(1);
    expect(t.posInTrackMs).toBe(0);
  });

  it("defaults now to performance.timeOrigin + performance.now(), not Date.now", () => {
    const clock = new ProgrammeClock({ compiled, clockSync: new ClockSync() });
    expect(clock.nowFn).not.toBe(Date.now);
    const expected = performance.timeOrigin + performance.now();
    expect(Math.abs(clock.nowFn() - expected)).toBeLessThan(1000);
  });
});

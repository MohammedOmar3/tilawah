import { describe, expect, it } from "vitest";
import { ClockSync } from "./clock-sync";

describe("ClockSync", () => {
  it("uses the lowest-RTT sample of a burst", () => {
    const cs = new ClockSync();
    cs.acceptBurst([
      { c0: 0, s: 5100, c1: 200 }, // rtt 200 → offset 5000
      { c0: 300, s: 5330, c1: 360 }, // rtt 60 → offset 5000
      { c0: 400, s: 5500, c1: 600 }, // rtt 200
    ]);
    expect(cs.offsetMs).toBe(5000);
    expect(cs.rttMs).toBe(60);
  });
  it("rejects a later burst whose best RTT is > 1.5× the best seen", () => {
    const cs = new ClockSync();
    cs.acceptBurst([{ c0: 0, s: 5030, c1: 60 }]);
    expect(cs.acceptBurst([{ c0: 1000, s: 7000, c1: 1200 }])).toBe(false); // rtt 200 > 90
    expect(cs.offsetMs).toBe(5000);
    expect(cs.rttMs).toBe(60);
  });
  it("accepts a later burst within 1.5× the best RTT", () => {
    const cs = new ClockSync();
    cs.acceptBurst([{ c0: 0, s: 5030, c1: 60 }]);
    expect(cs.acceptBurst([{ c0: 1000, s: 6045, c1: 1090 }])).toBe(true); // rtt 90
    expect(cs.offsetMs).toBe(5000);
    expect(cs.rttMs).toBe(90);
  });
  it("accepts a worse burst if the last accepted sample is older than 15 minutes", () => {
    const cs = new ClockSync();
    cs.acceptBurst([{ c0: 0, s: 5030, c1: 60 }]);
    cs.acceptBurst([{ c0: 900_001, s: 905_101, c1: 900_201 }]);
    expect(cs.offsetMs).toBe(5000);
    expect(cs.rttMs).toBe(200);
  });
  it("is unsynced until the first burst", () => {
    const cs = new ClockSync();
    expect(cs.synced).toBe(false);
    expect(cs.acceptBurst([])).toBe(false);
    expect(cs.synced).toBe(false);
    cs.acceptBurst([{ c0: 0, s: 5030, c1: 60 }]);
    expect(cs.synced).toBe(true);
  });
  it("maps local time to server time", () => {
    const cs = new ClockSync();
    expect(cs.serverNow(1234)).toBe(1234);
    cs.acceptBurst([{ c0: 0, s: 5030, c1: 60 }]);
    expect(cs.serverNow(1234)).toBe(6234);
  });
});

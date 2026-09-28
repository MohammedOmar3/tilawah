import { describe, expect, it } from "vitest";
import { formatCount, formatDuration, formatUntil, riwayahName, toArabicDigits } from "./format";

describe("formatDuration", () => {
  it.each([
    [0, "0:00"],
    [999, "0:00"],
    [59_999, "0:59"],
    [763_000, "12:43"],
    [3_730_000, "1:02:10"],
    [-5, "0:00"],
  ])("%d ms → %s", (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});

describe("toArabicDigits", () => {
  it("maps Western digits to Arabic-Indic", () => {
    expect(toArabicDigits(23)).toBe("٢٣");
    expect(toArabicDigits(110)).toBe("١١٠");
  });
});

describe("formatCount", () => {
  it("groups thousands", () => {
    expect(formatCount(4821)).toBe("4,821");
  });
});

describe("formatUntil", () => {
  it.each([
    [0, "in under a minute"],
    [59_999, "in under a minute"],
    [60_000, "in 1 min"],
    [29 * 60_000 + 30_000, "in 29 min"],
    [60 * 60_000, "in 1 h"],
    [65 * 60_000, "in 1 h 5 min"],
    [-5, "in under a minute"],
  ])("%d ms → %s", (ms, text) => {
    expect(formatUntil(ms)).toBe(text);
  });
});

describe("riwayahName", () => {
  it("names the common riwayat and capitalises others", () => {
    expect(riwayahName("hafs")).toBe("Hafs 'an 'Asim");
    expect(riwayahName("Warsh")).toBe("Warsh 'an Nafi'");
    expect(riwayahName("qalun")).toBe("Qalun");
  });
});

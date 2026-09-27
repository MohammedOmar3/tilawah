import { describe, expect, it } from "vitest";
import { formatCount, formatDuration, toArabicDigits } from "./format";

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

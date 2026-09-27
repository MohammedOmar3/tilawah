import { describe, expect, it } from "vitest";
import { backoffDelay } from "./backoff";

describe("backoffDelay", () => {
  it("doubles from 1 s and caps at 30 s with random() = 1", () => {
    const one = () => 1;
    expect([0, 1, 2, 3, 4, 5, 6, 20].map((a) => backoffDelay(a, one))).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000,
    ]);
  });
  it("is 0 with random() = 0 (full jitter)", () => {
    expect(backoffDelay(3, () => 0)).toBe(0);
  });
  it("scales the ceiling by random()", () => {
    expect(backoffDelay(2, () => 0.5)).toBe(2000);
  });
});

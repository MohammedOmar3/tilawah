import { describe, expect, it } from "vitest";
import { fitScale, joinFrame, listeningFrame, readingMaxHeight } from "./layout";

const phone = { width: 390, height: 844 };
const desktop = { width: 1440, height: 900 };

describe("listeningFrame", () => {
  it("centres the globe and tucks its lower edge under the dock", () => {
    const f = listeningFrame(phone, 300, 740);
    expect(f.cx).toBe(195);
    // Limited by the width on a phone.
    expect(f.r).toBeCloseTo(390 * 0.66, 10);
    expect(f.cy - f.r).toBeCloseTo(314 + 0.1 * f.r, 10);
    expect(f.cy + f.r).toBeGreaterThan(740);
  });

  it("grows when the reading block is shorter", () => {
    const withTranslation = listeningFrame(desktop, 330, 780);
    const without = listeningFrame(desktop, 230, 780);
    expect(without.r).toBeGreaterThan(withTranslation.r);
  });

  it("keeps a minimum size when there is hardly any room", () => {
    expect(listeningFrame(phone, 700, 710).r).toBeCloseTo(84, 10);
  });
});

describe("joinFrame", () => {
  it("puts the globe in the left half on wide screens", () => {
    expect(joinFrame(desktop, 0)).toEqual({ cx: 360, cy: 477, r: 360 });
  });

  it("puts the globe above the details on phones", () => {
    const f = joinFrame(phone, 462);
    expect(f.cx).toBe(195);
    expect(f.cy).toBe(262);
    expect(f.r).toBeCloseTo(171.6, 10);
  });
});

describe("readingMaxHeight", () => {
  it("allows 40% of the height on phones and 34% on wider screens", () => {
    expect(readingMaxHeight(phone)).toBeCloseTo(337.6, 10);
    expect(readingMaxHeight(desktop)).toBeCloseTo(306, 10);
  });
});

describe("fitScale", () => {
  it("keeps full size when the text fits", () => {
    expect(fitScale(() => 100, 200)).toBe(1);
  });

  it("steps down until the text fits", () => {
    expect(fitScale((s) => 300 * s, 240)).toBe(0.8);
  });

  it("never goes below the minimum", () => {
    expect(fitScale(() => 1000, 100)).toBe(0.52);
    expect(fitScale(() => 1000, 100, 0.9, 0.1)).toBe(0.9);
  });
});

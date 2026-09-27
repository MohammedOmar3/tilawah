import { describe, expect, it } from "vitest";
import { parseTanzilText } from "./text";

const sample = ["1|1|نص أ", "1|2|نص ب", "2|1|نص ج", "", "# comment line", "#  more"].join("\n");

describe("parseTanzilText", () => {
  it("groups ayahs by surah, keeps text byte-for-byte", () => {
    const out = parseTanzilText(sample);
    expect(out.get(1)).toEqual([{ n: 1, text: "نص أ" }, { n: 2, text: "نص ب" }]);
    expect(out.get(2)).toEqual([{ n: 1, text: "نص ج" }]);
  });
  it("rejects out-of-order ayahs", () => {
    expect(() => parseTanzilText("1|2|x\n1|1|y")).toThrow(/order/);
  });
  it("rejects malformed lines", () => {
    expect(() => parseTanzilText("1|x")).toThrow(/line 1/);
  });
  it("strips CR line endings but keeps tatweel and inner spaces", () => {
    const out = parseTanzilText("1|1|ٱلرَّحْمَـٰنِ  ٱلرَّحِيمِ \r\n");
    expect(out.get(1)).toEqual([{ n: 1, text: "ٱلرَّحْمَـٰنِ  ٱلرَّحِيمِ " }]);
  });
  it("keeps a | inside the text", () => {
    expect(parseTanzilText("1|1|a|b").get(1)).toEqual([{ n: 1, text: "a|b" }]);
  });
});

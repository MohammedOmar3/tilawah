import { describe, expect, it } from "vitest";
import { TEXT_SOURCE, buildManifest, sha256Hex } from "./manifest";

describe("sha256Hex", () => {
  it("hashes bytes as lowercase hex", () => {
    expect(sha256Hex(Buffer.from("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex(Buffer.alloc(0))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});

describe("buildManifest", () => {
  it("maps each file name to its hash, keys sorted", () => {
    const m = buildManifest({ "002.json": Buffer.from("b"), "001.json": Buffer.from("a") });
    expect(m.source).toBe(TEXT_SOURCE);
    expect(Object.keys(m.files)).toEqual(["001.json", "002.json"]);
    expect(m.files["001.json"]).toBe(sha256Hex(Buffer.from("a")));
    expect(m.files["002.json"]).toBe(sha256Hex(Buffer.from("b")));
  });
  it("serialises identically regardless of insertion order", () => {
    const a = buildManifest({ "x.json": Buffer.from("1"), "a.json": Buffer.from("2") });
    const b = buildManifest({ "a.json": Buffer.from("2"), "x.json": Buffer.from("1") });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

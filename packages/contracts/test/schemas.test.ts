import { describe, expect, it } from "vitest";
import programme from "../fixtures/programme.example.json";
import timings from "../fixtures/timings.example.json";
import surahs from "../fixtures/surahs.sample.json";
import text from "../fixtures/text.sample.json";
import presence from "../fixtures/presence.example.json";
import ws from "../fixtures/ws-messages.json";
import { ClientMessage, Presence, Programme, ServerMessage, Surah, SurahText, Timings } from "../src";

describe("schemas accept fixtures", () => {
  it("programme", () => expect(Programme.parse(programme)).toBeTruthy());
  it("timings", () => expect(Timings.parse(timings)).toBeTruthy());
  it("surahs", () => surahs.forEach((s) => expect(Surah.parse(s)).toBeTruthy()));
  it("text", () => expect(SurahText.parse(text)).toBeTruthy());
  it("presence", () => expect(Presence.parse(presence)).toBeTruthy());
  it("client messages", () => ws.clientValid.forEach((m) => expect(ClientMessage.parse(m)).toBeTruthy()));
  it("server messages", () => ws.serverValid.forEach((m) => expect(ServerMessage.parse(m)).toBeTruthy()));
});

describe("schemas reject bad input", () => {
  it("invalid client messages", () =>
    ws.clientInvalid.forEach((m) => expect(ClientMessage.safeParse(m).success).toBe(false)));
  it("overlapping segments", () =>
    expect(
      Timings.safeParse({
        surah: 1,
        reciter: "x",
        segments: [
          { ayah: 1, startMs: 0, endMs: 5000 },
          { ayah: 2, startMs: 4000, endMs: 6000 },
        ],
      }).success,
    ).toBe(false));
  it("unsorted segments", () =>
    expect(
      Timings.safeParse({
        surah: 1,
        reciter: "x",
        segments: [
          { ayah: 2, startMs: 5000, endMs: 6000 },
          { ayah: 1, startMs: 0, endMs: 1000 },
        ],
      }).success,
    ).toBe(false));
  it("segment ending before it starts", () =>
    expect(
      Timings.safeParse({ surah: 1, reciter: "x", segments: [{ ayah: 1, startMs: 10, endMs: 5 }] }).success,
    ).toBe(false));
  it("empty programme", () => expect(Programme.safeParse({ ...programme, tracks: [] }).success).toBe(false));
});

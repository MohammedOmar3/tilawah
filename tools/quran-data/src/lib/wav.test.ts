import { describe, expect, it } from "vitest";
import { encodeWav, synthTrack } from "./wav";

describe("encodeWav", () => {
  it("writes a valid 16-bit mono PCM header", () => {
    const buf = encodeWav(new Int16Array(16000), 16000);
    expect(buf.toString("ascii", 0, 4)).toBe("RIFF");
    expect(buf.toString("ascii", 8, 12)).toBe("WAVE");
    expect(buf.readUInt16LE(22)).toBe(1);      // channels
    expect(buf.readUInt32LE(24)).toBe(16000);  // sample rate
    expect(buf.readUInt16LE(34)).toBe(16);     // bits per sample
    expect(buf.readUInt32LE(40)).toBe(32000);  // data bytes
    expect(buf.length).toBe(44 + 32000);
  });
  it("writes samples little-endian after the header", () => {
    const buf = encodeWav(Int16Array.from([1, -2, 32767]), 8000);
    expect(buf.readUInt32LE(4)).toBe(36 + 6);
    expect(buf.readInt16LE(44)).toBe(1);
    expect(buf.readInt16LE(46)).toBe(-2);
    expect(buf.readInt16LE(48)).toBe(32767);
  });
});

describe("synthTrack", () => {
  it("has exactly durationMs of samples", () => {
    expect(synthTrack({ durationMs: 1500, sampleRate: 16000, beepAtMs: [0] }).length).toBe(24000);
  });
  it("is louder at a beep than between beeps", () => {
    const s = synthTrack({ durationMs: 2000, sampleRate: 16000, beepAtMs: [1000] });
    const rms = (a: number, b: number) => Math.sqrt(s.slice(a, b).reduce((x, v) => x + v * v, 0) / (b - a));
    expect(rms(16000, 16800)).toBeGreaterThan(rms(8000, 8800) * 3);
  });
});

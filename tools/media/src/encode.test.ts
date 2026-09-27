import { describe, expect, it } from "vitest";
import { ffmpegArgs, parseFfprobeDurationMs } from "./encode";

describe("encode", () => {
  it("builds mono 64 kbps AAC args with faststart", () => {
    expect(ffmpegArgs("in.mp3", "out.m4a")).toEqual([
      "-y", "-i", "in.mp3", "-vn", "-ac", "1", "-ar", "44100", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", "out.m4a",
    ]);
  });

  it("parses ffprobe's duration in seconds to whole ms", () => {
    expect(parseFfprobeDurationMs("123.456789\n")).toBe(123457);
  });

  it("rejects unparseable ffprobe output", () => {
    expect(() => parseFfprobeDurationMs("N/A\n")).toThrow();
  });
});

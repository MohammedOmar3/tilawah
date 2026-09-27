import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createAudioPool, SILENT_WAV } from "./audio-unlock";

class FakeAudio {
  src = "";
  paused = true;
  play = vi.fn(() => {
    this.paused = false;
    return Promise.resolve();
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
}

describe("audio pool", () => {
  it("is a valid silent WAV data URI", () => {
    expect(SILENT_WAV.startsWith("data:audio/wav;base64,")).toBe(true);
    const bytes = atob(SILENT_WAV.slice("data:audio/wav;base64,".length));
    expect(bytes.slice(0, 4)).toBe("RIFF");
    expect(bytes.slice(8, 12)).toBe("WAVE");
    const riffSize = bytes.charCodeAt(4) | (bytes.charCodeAt(5) << 8);
    expect(riffSize).toBe(bytes.length - 8);
  });

  it("unlocks every element synchronously with a silent clip and pauses it afterwards", async () => {
    const made: FakeAudio[] = [];
    const pool = createAudioPool(2, () => {
      const a = new FakeAudio();
      made.push(a);
      return a;
    });
    pool.unlock();
    expect(made).toHaveLength(2);
    for (const a of made) {
      expect(a.src).toBe(SILENT_WAV);
      expect(a.play).toHaveBeenCalledTimes(1);
    }
    await Promise.resolve();
    await Promise.resolve();
    for (const a of made) expect(a.pause).toHaveBeenCalled();
  });

  it("does not pause an element that already switched to real audio", async () => {
    const a = new FakeAudio();
    const pool = createAudioPool(1, () => a);
    pool.unlock();
    a.src = "/dev-audio/001.wav";
    await Promise.resolve();
    await Promise.resolve();
    expect(a.pause).not.toHaveBeenCalled();
  });

  it("hands the same elements to every session, in order", () => {
    const pool = createAudioPool(2, () => new FakeAudio());
    const first = [pool.createAudio(), pool.createAudio()];
    expect(first[0]).not.toBe(first[1]);
    expect([pool.createAudio(), pool.createAudio()]).toEqual(first);
    expect(pool.elements).toEqual(first);
  });

  it("survives play() throwing or rejecting", async () => {
    const throwing = new FakeAudio();
    throwing.play = vi.fn(() => {
      throw new Error("NotAllowed");
    });
    const rejecting = new FakeAudio();
    rejecting.play = vi.fn(() => Promise.reject(new Error("NotAllowed")));
    const queue = [throwing, rejecting];
    const pool = createAudioPool(2, () => queue.shift()!);
    expect(() => pool.unlock()).not.toThrow();
    await Promise.resolve();
  });
});

describe("Pages CSP", () => {
  it("lets media load the data: URL the unlock plays", () => {
    const headers = readFileSync(join(process.cwd(), "public/_headers"), "utf8");
    const mediaSrc = /media-src ([^;]+)/.exec(headers)?.[1] ?? "";
    expect(SILENT_WAV.startsWith("data:")).toBe(true);
    expect(mediaSrc.split(" ")).toContain("data:");
  });
});

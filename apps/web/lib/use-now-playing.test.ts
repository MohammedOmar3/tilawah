import { compileProgramme, type Programme, type Surah, type Timings } from "@tilawah/contracts";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createListeningStore, type ListeningStoreApi } from "./sync";
import { useNowPlaying } from "./use-now-playing";

const EPOCH = Date.parse("2026-09-01T00:00:00Z");
const programme: Programme = {
  version: "t",
  epoch: "2026-09-01T00:00:00Z",
  reciter: { id: "dev-tone", name: "Development tone", riwayah: "hafs" },
  tracks: [
    { surah: 1, durationMs: 10_000, audio: "/a/001.wav", timings: "/t/001.json" },
    { surah: 112, durationMs: 5_000, audio: "/a/112.wav", timings: "/t/112.json" },
  ],
};
const compiled = compileProgramme(programme);
const surah = (n: number, name: string): Surah => ({
  number: n,
  nameArabic: "س",
  nameTransliterated: name,
  nameEnglish: name,
  ayahCount: 4,
  revelation: "meccan",
});
const surahs = [surah(1, "Al-Faatiha"), ...Array.from({ length: 110 }, (_, i) => surah(i + 2, `S${i + 2}`)), surah(112, "Al-Ikhlaas"), surah(113, "Al-Falaq"), surah(114, "An-Naas")];
const timings: Record<string, Timings> = {
  "/t/001.json": {
    surah: 1,
    reciter: "dev-tone",
    segments: [
      { ayah: 1, startMs: 1000, endMs: 4000 },
      { ayah: 2, startMs: 4000, endMs: 10_000 },
    ],
  },
  "/t/112.json": { surah: 112, reciter: "dev-tone", segments: [{ ayah: 1, startMs: 0, endMs: 5000 }] },
};

describe("useNowPlaying", () => {
  let nowMs: number;
  let store: ListeningStoreApi;
  const loadTimings = vi.fn(async (url: string) => timings[url]!);

  beforeEach(() => {
    vi.useFakeTimers();
    nowMs = EPOCH + 500;
    store = createListeningStore();
    loadTimings.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const render = () =>
    renderHook(() => useNowPlaying(compiled, surahs, { now: () => nowMs, store, loadTimings }));

  it("returns null until the programme and surahs are loaded", () => {
    const { result } = renderHook(() => useNowPlaying(null, surahs, { now: () => nowMs, store, loadTimings }));
    expect(result.current).toBeNull();
  });

  it("derives the position from the local clock before joining", async () => {
    const { result } = render();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current).toMatchObject({
      trackIndex: 0,
      posInTrackMs: 500,
      msToNextTrack: 9500,
      ayah: 0,
      approximate: true,
    });
    expect(result.current!.surah!.nameTransliterated).toBe("Al-Faatiha");
    expect(result.current!.track.surah).toBe(1);
    expect(loadTimings).toHaveBeenCalledWith("/t/001.json");

    nowMs = EPOCH + 4250;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(result.current).toMatchObject({ posInTrackMs: 4250, ayah: 2 });

    nowMs = EPOCH + 12_000;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current).toMatchObject({ trackIndex: 1, posInTrackMs: 2000, ayah: 1 });
    expect(result.current!.surah!.nameTransliterated).toBe("Al-Ikhlaas");
  });

  it("uses the listening store once joined", async () => {
    const { result } = render();
    act(() => {
      store.getState().setStatus("playing");
      store.getState().setTick({ trackIndex: 1, posInTrackMs: 1234, ayah: 1, approximate: false });
    });
    expect(result.current).toMatchObject({
      trackIndex: 1,
      posInTrackMs: 1234,
      msToNextTrack: 5000 - 1234,
      ayah: 1,
      approximate: false,
    });
    expect(result.current!.surah!.number).toBe(112);

    act(() => store.getState().reset());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(result.current).toMatchObject({ trackIndex: 0, approximate: true });
  });
});

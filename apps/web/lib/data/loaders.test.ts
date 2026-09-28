import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLoaders, type Loaders } from "./loaders";

const programme = {
  version: "dev.1",
  epoch: "2026-09-01T00:00:00Z",
  reciter: { id: "dev-tone", name: "Development tone", riwayah: "hafs" },
  tracks: [{ surah: 1, durationMs: 60000, audio: "/dev-audio/001.wav", timings: "/data/timings/dev-tone/001.json" }],
};
const surahs = Array.from({ length: 114 }, (_, i) => ({
  number: i + 1,
  nameArabic: "س",
  nameTransliterated: `S-${i + 1}`,
  nameEnglish: `Surah ${i + 1}`,
  ayahCount: 3,
  revelation: "meccan",
}));
const text = { surah: 18, source: "tanzil-uthmani-hafs", ayahs: [{ n: 1, text: "ٱلْحَمْدُ" }] };
const translation = { surah: 18, id: "en.pickthall", name: "Pickthall", language: "en", source: "tanzil", ayahs: [{ n: 1, text: "Praise be to Allah" }] };
const timings = { surah: 1, reciter: "dev-tone", segments: [{ ayah: 0, startMs: 0, endMs: 1000 }] };

function respond(routes: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    if (!(url in routes)) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(routes[url]), { status: 200 });
  });
}

describe("loaders", () => {
  let fetchFn: ReturnType<typeof respond>;
  let loaders: Loaders;

  beforeEach(() => {
    fetchFn = respond({
      "/data/programme.dev.json": programme,
      "/data/surahs.json": surahs,
      "/data/text/018.json": text,
      "/data/text/001.json": { ...text, surah: 1 },
      "/data/timings/dev-tone/001.json": timings,
      "/bad.json": { version: "" },
      "/data/text/002.json": { surah: 2 },
      "/data/translations/en.pickthall/018.json": translation,
    });
    loaders = createLoaders(fetchFn as unknown as typeof fetch);
  });

  it("loads and validates the programme", async () => {
    await expect(loaders.loadProgramme("/data/programme.dev.json")).resolves.toEqual(programme);
    expect(fetchFn).toHaveBeenCalledWith("/data/programme.dev.json");
  });

  it("loads the surah list", async () => {
    const list = await loaders.loadSurahs();
    expect(list).toHaveLength(114);
    expect(fetchFn).toHaveBeenCalledWith("/data/surahs.json");
  });

  it("loads surah text from a zero-padded path and caches it", async () => {
    await expect(loaders.loadSurahText(18)).resolves.toEqual(text);
    await loaders.loadSurahText(18);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith("/data/text/018.json");
  });

  it("loads a surah's translation from its id's directory and caches it", async () => {
    await expect(loaders.loadTranslation("en.pickthall", 18)).resolves.toEqual(translation);
    await loaders.loadTranslation("en.pickthall", 18);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith("/data/translations/en.pickthall/018.json");
  });

  it("caches timings by URL", async () => {
    await expect(loaders.loadTimings("/data/timings/dev-tone/001.json")).resolves.toEqual(timings);
    await loaders.loadTimings("/data/timings/dev-tone/001.json");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("throws a readable error on a bad shape", async () => {
    await expect(loaders.loadProgramme("/bad.json")).rejects.toThrow(/\/bad\.json.*(version|tracks)/);
    await expect(loaders.loadSurahText(2)).rejects.toThrow(/\/data\/text\/002\.json/);
  });

  it("throws on HTTP errors and does not cache failures", async () => {
    await expect(loaders.loadTimings("/missing.json")).rejects.toThrow("/missing.json: HTTP 404");
    await expect(loaders.loadTimings("/missing.json")).rejects.toThrow("HTTP 404");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

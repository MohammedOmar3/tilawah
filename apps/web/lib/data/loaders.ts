import { Programme, Surahs, SurahText, Timings } from "@tilawah/contracts";
import type { z } from "zod";

type Fetch = (url: string) => Promise<Response>;

export function surahTextUrl(surah: number): string {
  return `/data/text/${String(surah).padStart(3, "0")}.json`;
}

async function fetchJson<T extends z.ZodType>(fetchFn: Fetch, url: string, schema: T): Promise<z.infer<T>> {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const parsed = schema.safeParse(await res.json());
  if (!parsed.success) {
    const first = parsed.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`${url}: unexpected shape (${first})`);
  }
  return parsed.data;
}

export interface Loaders {
  loadProgramme(url: string): Promise<Programme>;
  loadSurahs(): Promise<Surahs>;
  loadSurahText(surah: number): Promise<SurahText>;
  loadTimings(url: string): Promise<Timings>;
}

type Surahs = z.infer<typeof Surahs>;

/** Fetch + Zod-validate the static data files. Text and timings are cached by URL. */
export function createLoaders(fetchFn: Fetch = (url) => globalThis.fetch(url)): Loaders {
  const cache = new Map<string, Promise<unknown>>();
  const cached = <T>(url: string, load: () => Promise<T>): Promise<T> => {
    const hit = cache.get(url);
    if (hit) return hit as Promise<T>;
    const p = load();
    cache.set(url, p);
    p.catch(() => cache.delete(url));
    return p;
  };
  return {
    loadProgramme: (url) => fetchJson(fetchFn, url, Programme),
    loadSurahs: () => fetchJson(fetchFn, "/data/surahs.json", Surahs),
    loadSurahText: (surah) => {
      const url = surahTextUrl(surah);
      return cached(url, () => fetchJson(fetchFn, url, SurahText));
    },
    loadTimings: (url) => cached(url, () => fetchJson(fetchFn, url, Timings)),
  };
}

const defaultLoaders = createLoaders();
export const { loadProgramme, loadSurahs, loadSurahText, loadTimings } = defaultLoaders;

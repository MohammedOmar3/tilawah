import { describe, expect, it } from "vitest";
import {
  SETTINGS_KEY,
  clampTextScale,
  createSettingsStore,
  defaultSettings,
  isDark,
  readSettings,
  writeSettings,
} from "./settings";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

describe("readSettings", () => {
  it("returns the defaults when nothing is saved", () => {
    expect(readSettings(memoryStorage())).toEqual(defaultSettings);
    expect(readSettings(null)).toEqual(defaultSettings);
  });

  it("keeps the MVP's saved announce choice", () => {
    const s = memoryStorage({ [SETTINGS_KEY]: JSON.stringify({ announce: true }) });
    expect(readSettings(s)).toEqual({ ...defaultSettings, announce: true });
  });

  it("falls back per field on bad values and on bad JSON", () => {
    const s = memoryStorage({ [SETTINGS_KEY]: JSON.stringify({ theme: "sepia", textScale: 9, translation: false }) });
    expect(readSettings(s)).toEqual({ ...defaultSettings, textScale: 1.4, translation: false });
    expect(readSettings(memoryStorage({ [SETTINGS_KEY]: "{oops" }))).toEqual(defaultSettings);
    expect(readSettings(memoryStorage({ [SETTINGS_KEY]: "null" }))).toEqual(defaultSettings);
  });

  it("survives storage that throws", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readSettings(throwing)).toEqual(defaultSettings);
    expect(() => writeSettings(throwing, defaultSettings)).not.toThrow();
  });
});

describe("clampTextScale", () => {
  it("snaps to 10% steps between 80% and 140%", () => {
    expect(clampTextScale(1.04)).toBe(1);
    expect(clampTextScale(1.26)).toBe(1.3);
    expect(clampTextScale(0.1)).toBe(0.8);
    expect(clampTextScale(3)).toBe(1.4);
    expect(clampTextScale(Number.NaN)).toBe(1);
  });
});

describe("isDark", () => {
  it("follows the device only in auto", () => {
    expect(isDark("night", false)).toBe(true);
    expect(isDark("fajr", true)).toBe(false);
    expect(isDark("auto", true)).toBe(true);
    expect(isDark("auto", false)).toBe(false);
  });
});

describe("settings store", () => {
  it("loads, updates and saves", () => {
    const storage = memoryStorage({ [SETTINGS_KEY]: JSON.stringify({ theme: "fajr" }) });
    const store = createSettingsStore();
    expect(store.getState().loaded).toBe(false);
    store.getState().load(storage);
    expect(store.getState()).toMatchObject({ theme: "fajr", loaded: true });
    store.getState().update({ textScale: 1.1 + 0.1 }, storage);
    expect(store.getState().textScale).toBe(1.2);
    expect(JSON.parse(storage.data.get(SETTINGS_KEY)!)).toEqual({ ...defaultSettings, theme: "fajr", textScale: 1.2 });
  });
});

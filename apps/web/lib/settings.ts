import { z } from "zod";
import { create } from "zustand";

/** Night is dark, Fajr is light, Auto follows the device. */
export type ThemeMode = "night" | "fajr" | "auto";

export const TEXT_SCALE_MIN = 0.8;
export const TEXT_SCALE_MAX = 1.4;
export const TEXT_SCALE_STEP = 0.1;

export const SETTINGS_KEY = "tilawah.settings";

export interface Settings {
  theme: ThemeMode;
  /** Multiplies the ayah and translation size. */
  textScale: number;
  /** Show the translation when one is configured. */
  translation: boolean;
  /** Announce each new ayah to screen readers (spec §5.5). */
  announce: boolean;
}

export const defaultSettings: Settings = { theme: "auto", textScale: 1, translation: true, announce: false };

// Each field falls back on its own, so one bad value never resets the rest.
const Stored = z.object({
  theme: z.enum(["night", "fajr", "auto"]).catch(defaultSettings.theme),
  textScale: z.number().catch(defaultSettings.textScale),
  translation: z.boolean().catch(defaultSettings.translation),
  announce: z.boolean().catch(defaultSettings.announce),
});

export function clampTextScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  const stepped = Math.round(scale / TEXT_SCALE_STEP) * TEXT_SCALE_STEP;
  return Math.round(Math.min(TEXT_SCALE_MAX, Math.max(TEXT_SCALE_MIN, stepped)) * 100) / 100;
}

/** Settings saved on this device, or the defaults. Never throws. */
export function readSettings(storage: Pick<Storage, "getItem"> | null): Settings {
  try {
    const raw: unknown = JSON.parse(storage?.getItem(SETTINGS_KEY) ?? "{}");
    const s = Stored.parse(typeof raw === "object" && raw !== null ? raw : {});
    return { ...s, textScale: clampTextScale(s.textScale) };
  } catch {
    return { ...defaultSettings };
  }
}

export function writeSettings(storage: Pick<Storage, "setItem"> | null, settings: Settings): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* private mode: the settings last for this visit only */
  }
}

/** Whether the page shows the dark theme, given the mode and the device preference. */
export function isDark(theme: ThemeMode, prefersDark: boolean): boolean {
  return theme === "night" || (theme === "auto" && prefersDark);
}

export interface SettingsStore extends Settings {
  /** False until the saved settings have been read in the browser. */
  loaded: boolean;
  load(storage: Pick<Storage, "getItem"> | null): void;
  update(patch: Partial<Settings>, storage?: Pick<Storage, "setItem"> | null): void;
}

export function createSettingsStore() {
  return create<SettingsStore>()((set, get) => ({
    ...defaultSettings,
    loaded: false,
    load: (storage) => set({ ...readSettings(storage), loaded: true }),
    update: (patch, storage = null) => {
      const next: Settings = { ...pick(get()), ...patch };
      next.textScale = clampTextScale(next.textScale);
      set(next);
      writeSettings(storage, next);
    },
  }));
}

function pick(s: Settings): Settings {
  return { theme: s.theme, textScale: s.textScale, translation: s.translation, announce: s.announce };
}

export type SettingsStoreApi = ReturnType<typeof createSettingsStore>;

/** The store the UI reads. */
export const useSettingsStore = createSettingsStore();

/** localStorage, or null where it is blocked. */
export function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

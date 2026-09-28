"use client";

import { useEffect, useSyncExternalStore } from "react";
import { type ThemeMode, browserStorage, isDark, useSettingsStore } from "./settings";

const DARK_QUERY = "(prefers-color-scheme: dark)";
const THEME_COLOUR = { dark: "#050913", light: "#f5efe3" } as const;

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(DARK_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/** True while the device prefers a dark theme; follows live changes. */
export function usePrefersDark(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DARK_QUERY).matches,
    () => true,
  );
}

/** Puts the chosen theme on <html> (CSS follows) and on the browser's theme-color. */
export function applyTheme(theme: ThemeMode, dark: boolean): void {
  const root = document.documentElement;
  if (theme === "auto") delete root.dataset.theme;
  else root.dataset.theme = theme;
  // Next writes one theme-color per device scheme; an explicit choice overrides both.
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    const forScheme = m.media.includes("dark") ? THEME_COLOUR.dark : THEME_COLOUR.light;
    m.content = theme === "auto" ? forScheme : dark ? THEME_COLOUR.dark : THEME_COLOUR.light;
  });
}

/**
 * Loads the saved settings once, keeps <html> on the chosen theme, and says
 * whether the page is dark right now.
 */
export function useTheme(): { theme: ThemeMode; dark: boolean } {
  const theme = useSettingsStore((s) => s.theme);
  const loaded = useSettingsStore((s) => s.loaded);
  const load = useSettingsStore((s) => s.load);
  const prefersDark = usePrefersDark();
  const dark = isDark(theme, prefersDark);

  useEffect(() => {
    if (!loaded) load(browserStorage());
  }, [loaded, load]);

  useEffect(() => {
    if (loaded) applyTheme(theme, dark);
  }, [loaded, theme, dark]);

  return { theme, dark };
}

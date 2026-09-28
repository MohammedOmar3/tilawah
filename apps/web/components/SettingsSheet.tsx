"use client";

import Link from "next/link";
import { TEXT_SCALE_MAX, TEXT_SCALE_MIN, TEXT_SCALE_STEP, type ThemeMode } from "@/lib/settings";
import Sheet, { SheetGroup } from "./Sheet";
import Switch from "./Switch";

export interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  theme: ThemeMode;
  onTheme: (theme: ThemeMode) => void;
  textScale: number;
  onTextScale: (scale: number) => void;
  /** Null when no translation is configured: the row is hidden. */
  translation: { on: boolean; onChange: (on: boolean) => void } | null;
  announce: boolean;
  onAnnounce: (on: boolean) => void;
  anon: boolean;
  onAnon: (anon: boolean) => void;
  /** Listening now: the anonymous choice applies from the next join. */
  listening: boolean;
}

const THEMES: { mode: ThemeMode; label: string }[] = [
  { mode: "night", label: "Night" },
  { mode: "fajr", label: "Fajr" },
  { mode: "auto", label: "Auto" },
];

const round = "size-9 rounded-full border border-line-strong font-semibold disabled:opacity-40";

export default function SettingsSheet(p: SettingsSheetProps) {
  const pct = Math.round(p.textScale * 100);
  return (
    <Sheet open={p.open} onClose={p.onClose} title="Settings" subtitle="Saved on this device only.">
      <SheetGroup label="Appearance">
        <div role="group" aria-label="Theme" className="grid grid-cols-3 gap-1 rounded-[14px] bg-bg-2 p-1">
          {THEMES.map(({ mode, label }) => (
            <button
              key={mode}
              type="button"
              aria-pressed={p.theme === mode}
              onClick={() => p.onTheme(mode)}
              className="h-9 rounded-[10px] text-[13.5px] text-ink-2 aria-pressed:bg-surface aria-pressed:font-semibold aria-pressed:text-ink aria-pressed:shadow-[0_1px_4px_rgba(0,0,0,0.12)]"
            >
              {label}
            </button>
          ))}
        </div>
      </SheetGroup>
      <SheetGroup label="Reading">
        <div className="flex min-h-11 items-center justify-between gap-3 text-sm">
          <span id="text-size-label">Text size</span>
          <div className="flex items-center gap-1" role="group" aria-labelledby="text-size-label">
            <button
              type="button"
              aria-label="Smaller text"
              disabled={p.textScale <= TEXT_SCALE_MIN}
              onClick={() => p.onTextScale(p.textScale - TEXT_SCALE_STEP)}
              className={round}
            >
              A−
            </button>
            <output aria-live="polite" className="min-w-12 text-center text-[13px] font-semibold text-gold tabular-nums">
              {pct}%
            </output>
            <button
              type="button"
              aria-label="Larger text"
              disabled={p.textScale >= TEXT_SCALE_MAX}
              onClick={() => p.onTextScale(p.textScale + TEXT_SCALE_STEP)}
              className={round}
            >
              A+
            </button>
          </div>
        </div>
        {p.translation && (
          <Switch
            trailing
            label="English translation"
            checked={p.translation.on}
            onChange={p.translation.onChange}
            className="min-h-11 text-sm"
          />
        )}
        <Switch
          trailing
          label="Announce each ayah to screen readers"
          checked={p.announce}
          onChange={p.onAnnounce}
          className="min-h-11 text-sm"
        />
      </SheetGroup>
      <SheetGroup label="Privacy">
        <Switch
          trailing
          label="Listen anonymously"
          description={
            p.listening
              ? "Takes effect the next time you join."
              : "You still hear everything, but aren't placed on the globe."
          }
          checked={p.anon}
          onChange={p.onAnon}
          className="min-h-11 text-sm"
        />
        <Link href="/privacy" className="self-start text-[13px] text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink">
          How we handle your privacy
        </Link>
      </SheetGroup>
    </Sheet>
  );
}

import type { ReactNode } from "react";
import { Mark, MoonIcon, SlidersIcon, SunIcon } from "./icons";

export interface TopBarProps {
  /** The presence pill. */
  presence: ReactNode;
  dark: boolean;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
}

const iconButton =
  "glass grid size-[38px] place-items-center rounded-full text-ink-2 transition-colors hover:border-line-strong hover:text-ink";

export default function TopBar({ presence, dark, onToggleTheme, onOpenSettings }: TopBarProps) {
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-[5] flex items-center justify-between gap-3 px-[max(16px,3vw)] pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-2 *:pointer-events-auto">
      <div className="flex min-w-0 items-center gap-2.5">
        <Mark />
        <h1 className="m-0 text-[12.5px] font-semibold tracking-[0.22em] uppercase max-[520px]:sr-only">Tilawah</h1>
      </div>
      {presence}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={dark ? "Switch to Fajr (light)" : "Switch to Night (dark)"}
          className={iconButton}
        >
          {dark ? <MoonIcon /> : <SunIcon />}
        </button>
        <button type="button" onClick={onOpenSettings} aria-label="Settings" className={iconButton}>
          <SlidersIcon />
        </button>
      </div>
    </header>
  );
}

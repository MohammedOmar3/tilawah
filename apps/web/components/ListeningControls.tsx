"use client";

import Switch from "./Switch";

export interface ListeningControlsProps {
  onLeave: () => void;
  announce: boolean;
  onAnnounceChange: (announce: boolean) => void;
}

export default function ListeningControls({ onLeave, announce, onAnnounceChange }: ListeningControlsProps) {
  return (
    <div className="flex w-full flex-col items-center gap-4">
      <button
        type="button"
        onClick={onLeave}
        className="rounded-full border border-line px-8 py-3 text-sm text-fg transition-colors hover:border-gold hover:text-gold-bright"
      >
        Leave
      </button>
      <details className="max-w-xs text-sm text-muted">
        <summary className="cursor-pointer text-center">Settings</summary>
        <div className="pt-3">
          <Switch label="Announce each ayah to screen readers" checked={announce} onChange={onAnnounceChange} />
        </div>
      </details>
    </div>
  );
}

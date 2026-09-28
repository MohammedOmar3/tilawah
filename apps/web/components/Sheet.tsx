"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  closeLabel?: string;
  children: ReactNode;
}

/**
 * A modal sheet: centred on wide screens, rising from the bottom on phones.
 * Built on <dialog>, so focus stays inside, Escape closes it and the rest of the
 * page is inert while it is open.
 */
export default function Sheet({ open, onClose, title, subtitle, closeLabel = "Done", children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
    } else if (!open && d.open) {
      if (typeof d.close === "function") d.close();
      else d.removeAttribute("open");
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // A click on the backdrop lands on the dialog itself, outside the panel.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-auto max-h-[86vh] w-[min(100%-32px,440px)] overflow-auto rounded-[24px] border border-line bg-surface p-[22px] pb-[18px] text-ink shadow-[var(--shadow)] backdrop:bg-[var(--scrim)] backdrop:backdrop-blur-[6px] open:motion-safe:animate-sheet max-[600px]:mb-0 max-[600px]:w-full max-[600px]:max-w-none max-[600px]:rounded-b-none max-[600px]:pb-[calc(env(safe-area-inset-bottom,0px)+20px)]"
    >
      <h2 id={titleId} className="m-0 mb-1 text-[17px] font-semibold">
        {title}
      </h2>
      {subtitle && <p className="m-0 mb-4 text-[13px] text-ink-3">{subtitle}</p>}
      {children}
      <button
        type="button"
        onClick={onClose}
        className="mt-3.5 h-11 w-full rounded-full bg-bg-2 font-semibold text-ink"
      >
        {closeLabel}
      </button>
    </dialog>
  );
}

/** A labelled group of rows inside a sheet. */
export function SheetGroup({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-line py-3">
      {label && <p className="m-0 mb-1.5 text-[11px] font-semibold tracking-[0.14em] text-ink-3 uppercase">{label}</p>}
      {children}
    </div>
  );
}

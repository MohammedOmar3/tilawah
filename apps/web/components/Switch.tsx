"use client";

import { useId } from "react";

export interface SwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Extra text tied to the switch with aria-describedby. */
  description?: string;
}

/** An accessible on/off switch: a button with role="switch" and a visible label. */
export default function Switch({ label, checked, onChange, description }: SwitchProps) {
  const labelId = useId();
  const descId = useId();
  const buttonId = useId();
  return (
    <div className="flex items-start gap-3">
      <button
        id={buttonId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={description ? descId : undefined}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-line transition-colors ${
          checked ? "bg-gold/80" : "bg-bg-raised"
        }`}
      >
        <span
          aria-hidden="true"
          className={`inline-block size-4 rounded-full bg-fg transition-transform ${
            checked ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </button>
      <div className="flex flex-col text-left">
        <label id={labelId} htmlFor={buttonId} className="cursor-pointer text-sm text-fg">
          {label}
        </label>
        {description && (
          <span id={descId} className="text-xs text-muted">
            {description}
          </span>
        )}
      </div>
    </div>
  );
}

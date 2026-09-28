"use client";

import { useId } from "react";

export interface SwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Extra text tied to the switch with aria-describedby. */
  description?: string;
  /** Put the label first and the switch at the end of the row (settings). */
  trailing?: boolean;
  className?: string;
}

/** An accessible on/off switch: a button with role="switch" and a visible label. */
export default function Switch({ label, checked, onChange, description, trailing = false, className = "" }: SwitchProps) {
  const labelId = useId();
  const descId = useId();
  const buttonId = useId();
  const toggle = (
    <button
      id={buttonId}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelId}
      aria-describedby={description ? descId : undefined}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[21px] w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
        checked ? "bg-gold" : "bg-line-strong"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-[3px] left-[3px] size-[15px] rounded-full bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-transform ${
          checked ? "translate-x-[15px]" : ""
        }`}
      />
    </button>
  );
  const text = (
    <span className="flex min-w-0 flex-col text-left">
      <label id={labelId} htmlFor={buttonId} className="cursor-pointer">
        {label}
      </label>
      {description && (
        <span id={descId} className="text-xs text-ink-3">
          {description}
        </span>
      )}
    </span>
  );
  return (
    <div className={`flex items-center gap-2.5 ${trailing ? "justify-between" : ""} ${className}`}>
      {trailing ? (
        <>
          {text}
          {toggle}
        </>
      ) : (
        <>
          {toggle}
          {text}
        </>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import type { Status } from "@/lib/sync";
import Switch from "./Switch";

export interface JoinPanelProps {
  status: Status;
  onJoin: (choice: { anon: boolean }) => void;
  /** True until the programme has loaded. */
  disabled?: boolean;
  error?: string | null;
  /** The previous choice, when the listener has joined before in this visit. */
  defaultAnon?: boolean;
}

export default function JoinPanel({ status, onJoin, disabled = false, error, defaultAnon = false }: JoinPanelProps) {
  // Decision D4: visible on the globe by default, anonymous is one tap away.
  const [anon, setAnon] = useState(defaultAnon);
  const connecting = status === "connecting";
  return (
    <div className="flex w-full flex-col items-center gap-4">
      <button
        type="button"
        onClick={() => onJoin({ anon })}
        disabled={disabled || connecting}
        className="w-full max-w-xs rounded-full bg-gold px-8 py-4 text-base font-medium text-bg shadow-[0_0_40px_rgba(212,175,107,0.18)] transition-colors hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-60"
      >
        {connecting ? "Connecting…" : "Join global listening"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}. Please try again.
        </p>
      )}
      <div className="flex max-w-xs flex-col gap-2">
        <Switch
          label="Listen anonymously"
          checked={anon}
          onChange={setAnon}
          description="Anonymous listeners are counted but never placed on the globe."
        />
        <Link href="/privacy" className="self-start pl-13 text-xs text-muted underline decoration-line underline-offset-4 hover:text-fg">
          How we handle your privacy
        </Link>
      </div>
    </div>
  );
}

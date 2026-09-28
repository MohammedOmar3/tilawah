"use client";

import Link from "next/link";
import type { Ref } from "react";
import type { Status } from "@/lib/sync";
import NowCard, { type NowInfo } from "./NowCard";
import Switch from "./Switch";

export interface JoinViewProps {
  status: Status;
  now: NowInfo | null;
  onJoin: () => void;
  anon: boolean;
  onAnonChange: (anon: boolean) => void;
  /** True until the programme has loaded. */
  disabled?: boolean;
  /** Shown as an alert, as a full sentence. */
  error?: string | null;
  ref?: Ref<HTMLElement>;
}

const link = "underline decoration-line-strong underline-offset-4 hover:text-ink";

/**
 * Before joining. Phones: the details sit at the bottom and the globe fills the
 * space above. Wide screens: the details sit on the right, the globe on the left.
 */
export default function JoinView({ status, now, onJoin, anon, onAnonChange, disabled = false, error, ref }: JoinViewProps) {
  const connecting = status === "connecting";
  return (
    <section
      ref={ref}
      aria-label="Join the recitation"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[3] flex flex-col items-center gap-3.5 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+28px)] text-center *:pointer-events-auto [@media(max-height:700px)]:gap-2.5 min-[900px]:top-0 min-[900px]:right-auto min-[900px]:left-[55%] min-[900px]:w-[min(40vw,540px)] min-[900px]:items-start min-[900px]:justify-center min-[900px]:gap-5 min-[900px]:px-0 min-[900px]:pt-20 min-[900px]:pb-10 min-[900px]:pl-[2vw] min-[900px]:text-left"
    >
      <p
        lang="ar"
        dir="rtl"
        aria-hidden="true"
        className="font-title-ar text-[clamp(2.8rem,9vw,4.4rem)] leading-[1.05] font-bold text-gold [text-shadow:0_0_40px_var(--gold-wash)] min-[900px]:text-[clamp(4rem,6.5vw,6rem)]"
      >
        تلاوة
      </p>
      <p className="m-0 max-w-[32ch] text-[clamp(1rem,2.4vw,1.18rem)] text-ink [text-wrap:balance] [@media(max-height:700px)]:hidden min-[900px]:max-w-[24ch] min-[900px]:text-[clamp(1.2rem,1.7vw,1.5rem)]">
        One recitation of the Quran, heard at the same moment by listeners around the world.
      </p>
      <NowCard now={now} status={status} />
      <button
        type="button"
        onClick={onJoin}
        disabled={disabled || connecting}
        className="h-[52px] rounded-full bg-gold px-[34px] text-base font-semibold text-on-gold shadow-[0_10px_30px_-10px_var(--gold-soft)] transition hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {connecting ? "Connecting…" : "Join the recitation"}
      </button>
      {error && (
        <p role="alert" className="m-0 text-sm text-danger">
          {error}
        </p>
      )}
      <Switch
        label="Listen anonymously, without appearing on the globe"
        checked={anon}
        onChange={onAnonChange}
        className="max-w-[340px] text-[13px] text-ink-2"
      />
      <p className="m-0 max-w-[44ch] text-[11.5px] tracking-[0.02em] text-ink-3 min-[900px]:max-w-[40ch]">
        No accounts, no cookies, no tracking. Your location is only ever counted as a region.{" "}
        <Link href="/privacy" className={link}>
          How we handle your privacy
        </Link>
        . Quran text from the{" "}
        <a href="https://tanzil.net" className={link}>
          Tanzil Project
        </a>
        .
      </p>
    </section>
  );
}

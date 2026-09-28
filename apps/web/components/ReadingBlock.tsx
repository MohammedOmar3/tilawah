"use client";

import type { Surah } from "@tilawah/contracts";
import { type Ref, useLayoutEffect, useRef, useState } from "react";
import { fitScale, readingMaxHeight } from "@/lib/layout";
import AyahText, { type AyahLine } from "./AyahText";

export interface ReadingBlockProps {
  surah: Surah | null;
  /** 0 = the opening before ayah 1. */
  ayah: number;
  ayahs: readonly AyahLine[] | null;
  /** The current ayah's translation, when one is configured and switched on. */
  translation?: { text: string; source: string } | null;
  /** The listener's text size (Settings). */
  textScale: number;
  ref?: Ref<HTMLElement>;
}

/** Re-renders on viewport resizes, so the block refits. */
function useViewportSize(): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const update = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return size;
}

/** Re-renders once the web fonts have loaded, since they change the text's height. */
function useFontsReady(): boolean {
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    let live = true;
    document.fonts?.ready.then(() => live && setReady(true)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return ready;
}

/**
 * The surah, the ayah being recited and its translation, fixed under the header.
 * It shrinks its type until it fits in its share of the screen, so the globe
 * always keeps room below it.
 */
export default function ReadingBlock({ surah, ayah, ayahs, translation, textScale, ref }: ReadingBlockProps) {
  const inner = useRef<HTMLDivElement>(null);
  const viewport = useViewportSize();
  const fontsReady = useFontsReady();

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el || viewport.height === 0) return;
    el.style.setProperty("--ayah-scale", String(textScale));
    fitScale((s) => {
      el.style.setProperty("--fit", s.toFixed(2));
      return el.offsetHeight;
    }, readingMaxHeight(viewport));
  }, [ayah, ayahs, translation, textScale, viewport, fontsReady]);

  return (
    <section
      ref={ref}
      aria-label="Current ayah"
      className="pointer-events-none fixed top-[calc(env(safe-area-inset-top,0px)+58px)] left-1/2 z-[3] w-[min(100%-32px,760px)] -translate-x-1/2 text-center"
    >
      <div ref={inner} className="flex flex-col items-center gap-[calc(8px*var(--fit,1))] pt-[calc(12px*var(--fit,1))]">
        {surah && (
          <div className="flex flex-wrap items-baseline justify-center gap-x-2.5">
            <span
              lang="ar"
              dir="rtl"
              className="font-title-ar leading-[1.2] font-bold text-gold"
              style={{ fontSize: "calc(1.6rem * var(--fit, 1))" }}
            >
              {surah.nameArabic}
            </span>
            <span className="flex gap-2 text-[10.5px] font-semibold tracking-[0.16em] text-ink-3 uppercase">
              <span className="text-gold" data-testid="surah-name">
                {surah.nameTransliterated}
              </span>
              <span>{surah.nameEnglish}</span>
              <span data-testid="ayah-label" className="tabular-nums">
                {ayah === 0 ? "Opening" : `${surah.number}:${ayah}`}
              </span>
            </span>
          </div>
        )}
        <AyahText ayahs={ayahs} current={ayah} />
        {translation && (
          <>
            <p
              key={`tr-${ayah}`}
              lang="en"
              data-testid="translation"
              className="m-0 max-w-[60ch] font-tr text-ink-2 italic [text-wrap:pretty] motion-safe:animate-rise"
              style={{
                fontSize: "calc(clamp(1rem, 2.1vw, 1.15rem) * var(--ayah-scale, 1) * var(--fit, 1))",
                lineHeight: 1.5,
              }}
            >
              {translation.text}
            </p>
            <p className="m-0 text-[9.5px] font-semibold tracking-[0.16em] text-ink-3 uppercase">{translation.source}</p>
          </>
        )}
      </div>
    </section>
  );
}

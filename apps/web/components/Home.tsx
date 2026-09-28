"use client";

import { compileProgramme, type Programme, type Surah, type SurahText, type SurahTranslation } from "@tilawah/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import { type GlobeFrame, LazyGlobe } from "@/globe";
import { getConfig, getTranslationId } from "@/lib/config";
import { loadProgramme, loadSurahs, loadSurahText, loadTranslation } from "@/lib/data/loaders";
import { createPresencePoller, usePresenceStore } from "@/lib/data/presence";
import { riwayahName } from "@/lib/format";
import { joinFrame, listeningFrame } from "@/lib/layout";
import { browserStorage, useSettingsStore } from "@/lib/settings";
import { useListeningStore } from "@/lib/sync";
import { useListening } from "@/lib/use-listening";
import { useNowPlaying } from "@/lib/use-now-playing";
import { useTheme } from "@/lib/use-theme";
import AboutSheet from "./AboutSheet";
import AyahAnnouncer from "./AyahAnnouncer";
import CountsBar from "./CountsBar";
import Dock from "./Dock";
import JoinView from "./JoinView";
import type { NowInfo } from "./NowCard";
import ReadingBlock from "./ReadingBlock";
import SettingsSheet from "./SettingsSheet";
import TopBar from "./TopBar";
import { exposeForTests } from "./test-hooks";

/** Prefetch the next surah's text this long before the boundary. */
const PREFETCH_TEXT_MS = 30_000;

const sameFrame = (a: GlobeFrame | null, b: GlobeFrame) =>
  a !== null && Math.abs(a.cx - b.cx) < 0.5 && Math.abs(a.cy - b.cy) < 0.5 && Math.abs(a.r - b.r) < 0.5;

export default function Home() {
  const [programme, setProgramme] = useState<Programme | null>(null);
  const [surahs, setSurahs] = useState<Surah[] | null>(null);
  const [text, setText] = useState<SurahText | null>(null);
  const [translationDoc, setTranslationDoc] = useState<SurahTranslation | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"settings" | "about" | null>(null);

  const presence = usePresenceStore((s) => s.presence);
  const stale = usePresenceStore((s) => s.stale);
  const status = useListeningStore((s) => s.status);
  const error = useListeningStore((s) => s.error);
  const storedAnon = useListeningStore((s) => s.anon);
  // Decision D4: visible on the globe by default, anonymous is one tap away.
  const [anon, setAnon] = useState(storedAnon);

  const { theme, dark } = useTheme();
  const textScale = useSettingsStore((s) => s.textScale);
  const announce = useSettingsStore((s) => s.announce);
  const translationOn = useSettingsStore((s) => s.translation);
  const updateSettings = useSettingsStore((s) => s.update);
  const save = (patch: Parameters<typeof updateSettings>[0]) => updateSettings(patch, browserStorage());

  const compiled = useMemo(() => (programme ? compileProgramme(programme) : null), [programme]);
  const np = useNowPlaying(compiled, surahs);
  const listening = useListening({ surahs, onProgrammeReloaded: setProgramme });

  // Static data and presence polling. Async so a bad config surfaces as a load error.
  useEffect(() => {
    let live = true;
    let stopPoller = () => {};
    const boot = async () => {
      const config = getConfig();
      const poller = createPresencePoller({ apiUrl: config.apiUrl, intervalMs: config.presencePollMs });
      poller.start();
      stopPoller = () => poller.stop();
      if (config.e2e) exposeForTests({ listening });
      const [p, s] = await Promise.all([loadProgramme(config.programmeUrl), loadSurahs()]);
      if (!live) return;
      setProgramme(p);
      setSurahs(s);
    };
    boot().catch((err: unknown) => {
      console.error(err);
      if (live) setLoadError("The programme could not be loaded. Please reload the page.");
    });
    return () => {
      live = false;
      stopPoller();
    };
  }, [listening]);

  // Text for the current surah; the next surah's text shortly before the boundary.
  const surahNumber = np?.track.surah ?? null;
  const tracks = compiled?.programme.tracks;
  const nextTrack = tracks && np ? tracks[(np.trackIndex + 1) % tracks.length]! : null;
  const nextSurah = np && nextTrack && np.msToNextTrack < PREFETCH_TEXT_MS ? nextTrack.surah : null;
  useEffect(() => {
    if (surahNumber === null) return;
    let live = true;
    loadSurahText(surahNumber)
      .then((t) => live && setText(t))
      .catch((err: unknown) => console.error(err));
    return () => {
      live = false;
    };
  }, [surahNumber]);
  useEffect(() => {
    if (nextSurah !== null) loadSurahText(nextSurah).catch(() => undefined);
  }, [nextSurah]);

  // The translation follows the text: fetched only while it is switched on.
  const translationId = getTranslationId();
  const wantTranslation = translationId !== "" && translationOn;
  useEffect(() => {
    if (!wantTranslation || surahNumber === null) return;
    let live = true;
    loadTranslation(translationId, surahNumber)
      .then((t) => live && setTranslationDoc(t))
      .catch((err: unknown) => console.error(err));
    return () => {
      live = false;
    };
  }, [wantTranslation, translationId, surahNumber]);
  useEffect(() => {
    if (wantTranslation && nextSurah !== null) loadTranslation(translationId, nextSurah).catch(() => undefined);
  }, [wantTranslation, translationId, nextSurah]);

  const inSession = status !== "idle" && status !== "error";
  const ayahs = text && text.surah === surahNumber ? text.ayahs : null;
  // At the opening (ayah 0) the first ayah waits dimmed, and so does its translation.
  const shownAyah = Math.max(1, np?.ayah ?? 0);
  const translationLine =
    wantTranslation && translationDoc && translationDoc.surah === surahNumber
      ? translationDoc.ayahs.find((a) => a.n === shownAyah)
      : undefined;
  const translation =
    translationLine && translationDoc
      ? { text: translationLine.text, source: `${translationDoc.name} translation`, language: translationDoc.language }
      : null;
  const translationToggle =
    translationId !== "" ? { on: translationOn, onChange: (on: boolean) => save({ translation: on }) } : null;
  const now: NowInfo | null = np
    ? {
        surah: np.surah,
        ayah: np.ayah,
        posMs: np.posInTrackMs,
        durationMs: np.track.durationMs,
        reciter: programme?.reciter.name ?? "",
        riwayah: programme ? riwayahName(programme.reciter.riwayah) : "",
        next: nextTrack ? (surahs?.find((s) => s.number === nextTrack.surah) ?? null) : null,
        msToNext: np.msToNextTrack,
      }
    : null;

  // Where the globe sits: beside or above the join details, or between the
  // reading block and the dock while listening. It glides between the two.
  const readingRef = useRef<HTMLElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const joinRef = useRef<HTMLElement>(null);
  const [frame, setFrame] = useState<GlobeFrame | null>(null);
  useEffect(() => {
    const compute = () => {
      const v = { width: window.innerWidth, height: window.innerHeight };
      const next = inSession
        ? listeningFrame(
            v,
            readingRef.current?.getBoundingClientRect().bottom ?? 58,
            dockRef.current?.getBoundingClientRect().top ?? v.height,
          )
        : joinFrame(v, joinRef.current?.getBoundingClientRect().top ?? v.height);
      setFrame((f) => (sameFrame(f, next) ? f : next));
    };
    compute();
    const observer = new ResizeObserver(compute);
    for (const el of [readingRef.current, dockRef.current, joinRef.current]) if (el) observer.observe(el);
    window.addEventListener("resize", compute);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", compute);
    };
  }, [inSession]);

  return (
    <div className="fixed inset-0 overflow-hidden overscroll-none bg-bg text-[15px] leading-normal text-ink">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: "var(--glow)" }} />
      <div className="absolute inset-0" data-testid="globe-backdrop">
        {presence && <LazyGlobe presence={presence} pulseIntervalMs={getConfig().presencePollMs} frame={frame} />}
      </div>

      <TopBar
        presence={<CountsBar listeners={presence?.listeners ?? null} countries={presence?.countries ?? null} stale={stale} />}
        dark={dark}
        onToggleTheme={() => save({ theme: dark ? "fajr" : "night" })}
        onOpenSettings={() => setSheet("settings")}
      />

      {inSession ? (
        <>
          <ReadingBlock
            ref={readingRef}
            surah={np?.surah ?? null}
            ayah={np?.ayah ?? 0}
            ayahs={ayahs}
            translation={translation}
            textScale={textScale}
          />
          <Dock
            ref={dockRef}
            status={status}
            reciter={now?.reciter ?? ""}
            ayah={np?.ayah ?? 0}
            ayahCount={np?.surah?.ayahCount ?? 0}
            posMs={np?.posInTrackMs ?? 0}
            durationMs={np?.track.durationMs ?? 0}
            onLeave={listening.leave}
            onAbout={() => setSheet("about")}
            translation={translationToggle}
          />
          <AyahAnnouncer enabled={announce} surahName={np?.surah?.nameTransliterated ?? ""} ayah={np?.ayah ?? 0} />
        </>
      ) : (
        <JoinView
          ref={joinRef}
          status={status}
          now={now}
          anon={anon}
          onAnonChange={setAnon}
          disabled={!programme}
          error={loadError ?? (error ? `${error}. Please try again.` : null)}
          onJoin={() => {
            if (!programme) return;
            if (status === "error") listening.leave();
            listening.join(programme, anon);
          }}
        />
      )}

      <SettingsSheet
        open={sheet === "settings"}
        onClose={() => setSheet(null)}
        theme={theme}
        onTheme={(t) => save({ theme: t })}
        textScale={textScale}
        onTextScale={(s) => save({ textScale: s })}
        translation={translationToggle}
        announce={announce}
        onAnnounce={(a) => save({ announce: a })}
        anon={anon}
        onAnon={setAnon}
        listening={inSession}
      />
      <AboutSheet
        open={sheet === "about"}
        onClose={() => setSheet(null)}
        now={now}
        translationName={translationId !== "" ? (translationDoc?.name ?? null) : null}
      />
    </div>
  );
}

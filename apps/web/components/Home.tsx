"use client";

import { compileProgramme, type Programme, type Surah, type SurahText } from "@tilawah/contracts";
import { useEffect, useMemo, useState } from "react";
import { LazyGlobe } from "@/globe";
import { getConfig } from "@/lib/config";
import { loadProgramme, loadSurahs, loadSurahText } from "@/lib/data/loaders";
import { createPresencePoller, usePresenceStore } from "@/lib/data/presence";
import { useListeningStore } from "@/lib/sync";
import { useListening } from "@/lib/use-listening";
import { useNowPlaying } from "@/lib/use-now-playing";
import AyahAnnouncer from "./AyahAnnouncer";
import AyahText from "./AyahText";
import CountsBar from "./CountsBar";
import Footer from "./Footer";
import JoinPanel from "./JoinPanel";
import ListeningControls from "./ListeningControls";
import NowPlaying from "./NowPlaying";
import ProgressBar from "./ProgressBar";
import StatusLine from "./StatusLine";
import { exposeForTests } from "./test-hooks";

/** Prefetch the next surah's text this long before the boundary. */
const PREFETCH_TEXT_MS = 30_000;

function readAnnounce(): boolean {
  try {
    return JSON.parse(localStorage.getItem("tilawah.settings") ?? "{}").announce === true;
  } catch {
    return false;
  }
}

function saveAnnounce(announce: boolean): void {
  try {
    localStorage.setItem("tilawah.settings", JSON.stringify({ announce }));
  } catch {
    /* private mode: the setting lasts for this visit only */
  }
}

export default function Home() {
  const [programme, setProgramme] = useState<Programme | null>(null);
  const [surahs, setSurahs] = useState<Surah[] | null>(null);
  const [text, setText] = useState<SurahText | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState(false);

  const presence = usePresenceStore((s) => s.presence);
  const stale = usePresenceStore((s) => s.stale);
  const status = useListeningStore((s) => s.status);
  const error = useListeningStore((s) => s.error);
  const anon = useListeningStore((s) => s.anon);

  const compiled = useMemo(() => (programme ? compileProgramme(programme) : null), [programme]);
  const np = useNowPlaying(compiled, surahs);
  const listening = useListening({ surahs, onProgrammeReloaded: setProgramme });

  // Static data, presence polling and settings. Async so a bad config surfaces as a load error.
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
      setAnnounce(readAnnounce());
      setProgramme(p);
      setSurahs(s);
    };
    boot().catch((err: unknown) => {
      console.error(err);
      if (live) setLoadError("The programme could not be loaded");
    });
    return () => {
      live = false;
      stopPoller();
    };
  }, [listening]);

  // Text for the current surah; the next surah's text shortly before the boundary.
  const surahNumber = np?.track.surah ?? null;
  const nextSurah =
    compiled && np && np.msToNextTrack < PREFETCH_TEXT_MS
      ? compiled.programme.tracks[(np.trackIndex + 1) % compiled.programme.tracks.length]!.surah
      : null;
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

  const joined = status !== "idle";
  const ayahs = text && text.surah === surahNumber ? text.ayahs : null;

  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden">
      <div className="absolute inset-0 -z-10 flex items-center justify-center" data-testid="globe-backdrop">
        <div className="aspect-square h-full max-h-[110vw] w-full max-w-[110vh]">
          {presence && <LazyGlobe presence={presence} pulseIntervalMs={getConfig().presencePollMs} />}
        </div>
      </div>
      {/* A soft scrim keeps text readable over the globe without hiding it. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(7,11,18,0.35)_0%,rgba(7,11,18,0.8)_65%,rgba(7,11,18,0.95)_100%)]"
      />

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center gap-6 px-5 pt-8 sm:pointer-events-none sm:[&_a]:pointer-events-auto sm:[&_button]:pointer-events-auto sm:[&_details]:pointer-events-auto">
        <CountsBar
          listeners={presence?.listeners ?? null}
          countries={presence?.countries ?? null}
          stale={stale}
        />
        {loadError ? (
          <p role="alert" className="text-center text-muted">
            {loadError}. Please reload the page.
          </p>
        ) : (
          <>
            <NowPlaying surah={np?.surah ?? null} ayah={np?.ayah ?? 0} />
            <div className="rounded-2xl bg-bg/60 px-4 py-2 backdrop-blur-[2px]">
              <AyahText ayahs={ayahs} current={np?.ayah ?? 0} />
            </div>
            <div className="flex w-full max-w-sm flex-col gap-2">
              <ProgressBar posMs={np?.posInTrackMs ?? 0} durationMs={np?.track.durationMs ?? 0} />
              <StatusLine status={status} approximate={np?.approximate ?? true} />
            </div>
            <AyahAnnouncer enabled={announce && joined} surahName={np?.surah?.nameTransliterated ?? ""} ayah={np?.ayah ?? 0} />
          </>
        )}
        <div className="mt-auto flex w-full flex-col items-center gap-6 pb-4">
          {joined && status !== "error" ? (
            <ListeningControls
              onLeave={listening.leave}
              announce={announce}
              onAnnounceChange={(a) => {
                setAnnounce(a);
                saveAnnounce(a);
              }}
            />
          ) : (
            <JoinPanel
              status={status}
              error={error}
              disabled={!programme}
              defaultAnon={anon}
              onJoin={({ anon: a }) => {
                if (!programme) return;
                if (status === "error") listening.leave();
                listening.join(programme, a);
              }}
            />
          )}
          <Footer reciter={programme?.reciter.name} />
        </div>
      </main>
    </div>
  );
}

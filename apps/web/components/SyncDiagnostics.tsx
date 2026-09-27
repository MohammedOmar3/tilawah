"use client";

import { compileProgramme, type Programme, type Surah } from "@tilawah/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getConfig } from "@/lib/config";
import { loadProgramme, loadSurahs } from "@/lib/data/loaders";
import { formatDuration } from "@/lib/format";
import { useListeningStore } from "@/lib/sync";
import { useListening } from "@/lib/use-listening";
import JoinPanel from "./JoinPanel";

const REFRESH_MS = 250;
const MAX_EVENTS = 20;

interface LogEntry {
  at: string;
  text: string;
}

const ms = (v: number | null | undefined, digits = 1) => (v === null || v === undefined ? "—" : `${v.toFixed(digits)} ms`);

function timeOfDay(): string {
  const d = new Date();
  return `${d.toISOString().slice(11, 23)}Z`;
}

/** The /lab/audio page: the Join flow plus a live table of sync internals (manual step M-E8). */
export default function SyncDiagnostics() {
  const [programme, setProgramme] = useState<Programme | null>(null);
  const [surahs, setSurahs] = useState<Surah[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const [visibility, setVisibility] = useState("—");
  const [events, setEvents] = useState<LogEntry[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const detach = useRef<Array<() => void>>([]);

  const state = useListeningStore();
  const listening = useListening({ surahs, onProgrammeReloaded: setProgramme });
  const compiled = useMemo(() => (programme ? compileProgramme(programme) : null), [programme]);

  const log = useCallback((text: string) => {
    setEvents((e) => [{ at: timeOfDay(), text }, ...e].slice(0, MAX_EVENTS));
  }, []);

  useEffect(() => {
    let live = true;
    const listeners = detach.current;
    const boot = async () => {
      const config = getConfig();
      const [p, s] = await Promise.all([loadProgramme(config.programmeUrl), loadSurahs()]);
      if (!live) return;
      setProgramme(p);
      setSurahs(s);
    };
    boot().catch((err: unknown) => live && setLoadError(err instanceof Error ? err.message : String(err)));
    // Re-render on a timer: audio.currentTime is not observable, and reading it drives the table.
    const id = setInterval(() => {
      setTick((t) => t + 1);
      setVisibility(document.visibilityState);
    }, REFRESH_MS);
    return () => {
      live = false;
      clearInterval(id);
      for (const off of listeners.splice(0)) off();
    };
  }, []);

  // Store-driven events: socket status and track changes.
  const prevStatus = useRef(state.status);
  const prevTrack = useRef(state.trackIndex);
  useEffect(() => {
    if (prevStatus.current !== state.status) log(`status ${prevStatus.current} → ${state.status}`);
    prevStatus.current = state.status;
  }, [state.status, log]);
  useEffect(() => {
    if (prevTrack.current !== state.trackIndex && state.status !== "idle") log(`track change → index ${state.trackIndex}`);
    prevTrack.current = state.trackIndex;
  }, [state.trackIndex, state.status, log]);

  const watchElements = () => {
    if (detach.current.length) return;
    listening.audioElements().forEach((el, i) => {
      const on = (type: string, text: () => string) => {
        const fn = () => log(`audio#${i} ${text()}`);
        el.addEventListener(type, fn);
        detach.current.push(() => el.removeEventListener(type, fn));
      };
      on("seeking", () => `seek → ${el.currentTime.toFixed(3)} s`);
      on("ratechange", () => `rate → ${el.playbackRate.toFixed(4)}`);
      on("waiting", () => "stall (waiting)");
      on("stalled", () => "stall (network)");
      on("playing", () => "playing");
      on("error", () => `error ${el.error?.code ?? ""}`);
    });
  };

  const els = listening.audioElements();
  const heard = els.find((e) => !e.paused) ?? null;
  const track = compiled?.programme.tracks[state.trackIndex];
  const surah = track ? surahs?.find((s) => s.number === track.surah) : undefined;
  const joined = state.status !== "idle";
  const rows: Array<[string, string]> = [
    ["Clock offset", ms(state.offsetMs)],
    ["RTT", ms(state.rttMs)],
    ["Target position", joined ? `${(state.posInTrackMs / 1000).toFixed(3)} s` : "—"],
    ["audio.currentTime", heard ? `${heard.currentTime.toFixed(3)} s` : "—"],
    ["Error", ms(state.errMs)],
    ["Playback rate", heard ? heard.playbackRate.toFixed(4) : state.rate.toFixed(4)],
    ["Output latency", joined ? ms(listening.outputLatencyMs()) : "—"],
    ["Current track", track ? `#${state.trackIndex} · surah ${track.surah}${surah ? ` ${surah.nameTransliterated}` : ""}` : "—"],
    ["Time to next track", joined && track ? formatDuration(track.durationMs - state.posInTrackMs) : "—"],
    ["Socket status", state.status],
    ["Clock synced", state.approximate ? "no (local clock)" : "yes"],
    ["Visibility", visibility],
    ["Programme", programme ? programme.version : "—"],
  ];

  const report = () =>
    [
      `Quran Global sync report ${new Date().toISOString()}`,
      `User agent: ${navigator.userAgent}`,
      ...rows.map(([k, v]) => `${k}: ${v}`),
      "Events (newest first):",
      ...events.map((e) => `  ${e.at} ${e.text}`),
    ].join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report());
      setCopied("Copied");
    } catch {
      setCopied("Copy failed: select the text below");
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-8">
      <h1 className="text-xl font-medium">Audio sync diagnostics</h1>
      {loadError && (
        <p role="alert" className="text-sm text-red-300">
          {loadError}
        </p>
      )}
      {joined && state.status !== "error" ? (
        <button
          type="button"
          onClick={listening.leave}
          className="self-start rounded-full border border-line px-6 py-2 text-sm hover:border-gold"
        >
          Leave
        </button>
      ) : (
        <JoinPanel
          status={state.status}
          error={state.error}
          disabled={!programme}
          onJoin={({ anon }) => {
            if (!programme) return;
            if (state.status === "error") listening.leave();
            listening.join(programme, anon);
            watchElements();
            log(`join (anon: ${anon})`);
          }}
        />
      )}
      <table className="w-full text-sm">
        <caption className="sr-only">Live sync values</caption>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-line">
              <th scope="row" className="py-1.5 pr-4 text-left font-normal text-muted">
                {k}
              </th>
              <td className="py-1.5 font-mono tabular-nums">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void copy()}
          className="rounded-full border border-line px-5 py-2 text-sm hover:border-gold"
        >
          Copy report
        </button>
        {copied && <span className="text-sm text-muted">{copied}</span>}
      </div>
      <section aria-label="Event log">
        <h2 className="mb-2 text-sm text-muted">Last {MAX_EVENTS} events</h2>
        <ol className="flex flex-col gap-0.5 font-mono text-xs">
          {events.length === 0 && <li className="text-muted">No events yet.</li>}
          {events.map((e, i) => (
            <li key={`${e.at}-${i}`}>
              <span className="text-muted">{e.at}</span> {e.text}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

import { ayahAt, compileProgramme, Timings, type Programme } from "@tilawah/contracts";
import { AudioEngine } from "../../player/audio-engine";
import { ClockSync } from "./clock-sync";
import { ProgrammeClock } from "./programme-clock";
import { browserNow, browserTimers, type AudioLike, type NowFn, type TimerId, type Timers, type WebSocketCtor } from "./runtime";
import { SyncSocket } from "./socket";
import { useListeningStore, type ListeningStoreApi, type Status } from "./store";

export const UI_TICK_MS = 250;
export const STAT_EVERY_MS = 60_000;
/** If the clock has not synced by then (server unreachable), start playing on the local clock. */
export const SYNC_FALLBACK_MS = 5000;
const TIMINGS_AHEAD_MS = 30_000;

interface EventTargetLike {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export interface VisibilityTargetLike extends EventTargetLike {
  readonly visibilityState: string;
}

export interface MediaMetadataInit {
  title: string;
  artist: string;
}

export interface ListeningSessionDeps extends Timers {
  WebSocket: WebSocketCtor;
  now: NowFn;
  random: () => number;
  createAudio: () => AudioLike;
  /** Source of `visibilitychange` (the document). */
  document: VisibilityTargetLike | null;
  /** Source of `online` (the window). */
  window: EventTargetLike | null;
}

export interface ListeningSessionOptions {
  programme: Programme;
  wsUrl: string;
  anon: boolean;
  /** Fetch and validate a timings file; defaults to fetch + Zod. */
  loadTimings?: (url: string) => Promise<Timings>;
  rateMax?: number;
  outputLatencyMs?: number;
  /** The server runs a different programme version: reload the page data. */
  onProgrammeChanged?: (version: string) => void;
  setMediaMetadata?: (metadata: MediaMetadataInit) => void;
  /** Title shown in the OS media controls; defaults to "Surah N". */
  surahName?: (surah: number) => string;
  store?: ListeningStoreApi;
  deps?: Partial<ListeningSessionDeps>;
}

export interface ListeningSession {
  /** Start listening. Call from the Join click handler. */
  join(): void;
  /** Stop listening and reset the store. A session cannot be joined again. */
  leave(): void;
}

function browserDeps(partial: Partial<ListeningSessionDeps>): ListeningSessionDeps {
  const timers = partial.setTimeout ? null : browserTimers();
  return {
    // The DOM WebSocket satisfies WebSocketLike at runtime; its handler types are just narrower.
    WebSocket: partial.WebSocket ?? (globalThis.WebSocket as unknown as WebSocketCtor),
    now: partial.now ?? browserNow,
    random: partial.random ?? Math.random,
    createAudio: partial.createAudio ?? (() => new Audio()),
    document: partial.document !== undefined ? partial.document : (globalThis.document ?? null),
    window: partial.window !== undefined ? partial.window : (globalThis.window ?? null),
    setTimeout: partial.setTimeout ?? timers!.setTimeout,
    clearTimeout: partial.clearTimeout ?? timers!.clearTimeout,
    setInterval: partial.setInterval ?? timers!.setInterval,
    clearInterval: partial.clearInterval ?? timers!.clearInterval,
  };
}

async function fetchTimings(url: string): Promise<Timings> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`timings ${url}: HTTP ${res.status}`);
  return Timings.parse(await res.json());
}

function browserMediaMetadata({ title, artist }: MediaMetadataInit): void {
  const nav = globalThis.navigator as Navigator | undefined;
  if (!nav?.mediaSession || typeof MediaMetadata === "undefined") return;
  nav.mediaSession.metadata = new MediaMetadata({ title, artist });
}

export function createListeningSession(options: ListeningSessionOptions): ListeningSession {
  const deps = browserDeps(options.deps ?? {});
  const store = options.store ?? useListeningStore;
  const loadTimings = options.loadTimings ?? fetchTimings;
  const setMediaMetadata = options.setMediaMetadata ?? browserMediaMetadata;
  const surahName = options.surahName ?? ((n: number) => `Surah ${n}`);
  const { programme } = options;
  const tracks = programme.tracks;
  const compiled = compileProgramme(programme);
  const clockSync = new ClockSync();
  const programmeClock = new ProgrammeClock({ compiled, clockSync, now: deps.now });
  const timings = new Map<number, Timings>();
  const loading = new Set<number>();
  let errSamples: number[] = [];
  let state: "new" | "joined" | "left" = "new";
  let audioStarted = false;
  let audioPlaying = false;
  const timers: TimerId[] = [];
  const intervals: TimerId[] = [];

  const setStatus = (s: Status) => {
    if (store.getState().status !== s) store.getState().setStatus(s);
  };

  const ensureTimings = (i: number) => {
    if (timings.has(i) || loading.has(i)) return;
    loading.add(i);
    loadTimings(tracks[i]!.timings)
      .then((t) => {
        if (state !== "left") timings.set(i, t);
      })
      .catch(() => {
        /* retried on a later UI tick */
      })
      .finally(() => loading.delete(i));
  };

  const engine = new AudioEngine({
    programmeClock,
    compiled,
    getTimings: (i) => timings.get(i),
    createAudio: deps.createAudio,
    outputLatencyMs: options.outputLatencyMs ?? 0,
    rateMax: options.rateMax,
    deps,
    onPlaying: () => {
      audioPlaying = true;
      socket.setPlaying(true);
      setStatus(socket.connected ? "playing" : "reconnecting");
      intervals.push(deps.setInterval(sendStat, STAT_EVERY_MS));
    },
    onTick: ({ errMs, rate }) => {
      errSamples.push(Math.abs(errMs));
      store.getState().setTick({ errMs, rate });
    },
    onTrackChange: (i) => {
      ensureTimings(i);
      setMediaMetadata({ title: surahName(tracks[i]!.surah), artist: programme.reciter.name });
    },
    onError: () => store.getState().setError("Audio could not start"),
  });

  const startAudio = () => {
    if (audioStarted || state !== "joined") return;
    audioStarted = true;
    engine.start();
  };

  const socket = new SyncSocket({
    url: options.wsUrl,
    anon: options.anon,
    programmeVersion: programme.version,
    clockSync,
    deps,
    onWelcome: () => setStatus(audioPlaying ? "playing" : "syncing"),
    onSync: (accepted) => {
      store.getState().setTick({ offsetMs: clockSync.offsetMs, rttMs: clockSync.rttMs, approximate: false });
      if (!audioStarted) startAudio();
      else if (accepted) engine.correctNow();
    },
    onDisconnect: () => setStatus("reconnecting"),
    onProgrammeChanged: (version) => options.onProgrammeChanged?.(version),
  });

  function sendStat() {
    if (!audioPlaying || clockSync.rttMs === null || errSamples.length === 0) return;
    const errMs = errSamples.reduce((a, b) => a + b, 0) / errSamples.length;
    errSamples = [];
    socket.sendStat({ rttMs: clockSync.rttMs, offsetMs: clockSync.offsetMs, errMs });
  }

  const uiTick = () => {
    const t = programmeClock.target();
    const segs = timings.get(t.trackIndex)?.segments;
    store.getState().setTick({
      trackIndex: t.trackIndex,
      posInTrackMs: t.posInTrackMs,
      ayah: segs ? ayahAt(segs, t.posInTrackMs) : 0,
      approximate: t.approximate,
    });
    ensureTimings(t.trackIndex);
    if (t.msToNextTrack < TIMINGS_AHEAD_MS) ensureTimings((t.trackIndex + 1) % tracks.length);
  };

  const wake = () => {
    socket.resync();
    engine.correctNow();
  };
  const onOnline = () => {
    socket.reconnectNow();
    engine.correctNow();
  };
  const onVisibility = () => {
    if (deps.document?.visibilityState === "visible") wake();
  };

  return {
    join() {
      if (state !== "new") return;
      state = "joined";
      store.getState().setAnon(options.anon);
      store.getState().setError(null);
      setStatus("connecting");
      uiTick();
      intervals.push(deps.setInterval(uiTick, UI_TICK_MS));
      timers.push(deps.setTimeout(startAudio, SYNC_FALLBACK_MS));
      deps.document?.addEventListener("visibilitychange", onVisibility);
      deps.window?.addEventListener("online", onOnline);
      socket.connect();
    },
    leave() {
      if (state !== "joined") return;
      state = "left";
      socket.setPlaying(false);
      socket.close();
      engine.dispose();
      for (const id of timers) deps.clearTimeout(id);
      for (const id of intervals) deps.clearInterval(id);
      deps.document?.removeEventListener("visibilitychange", onVisibility);
      deps.window?.removeEventListener("online", onOnline);
      store.getState().reset();
    },
  };
}

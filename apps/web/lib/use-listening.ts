"use client";

import type { Programme, Surah } from "@tilawah/contracts";
import { useEffect, useState } from "react";
import { createAudioPool, type AudioPool } from "./audio-unlock";
import { getConfig } from "./config";
import { loadProgramme, loadTimings } from "./data/loaders";
import { createListeningSession, probeOutputLatencyMs, type ListeningSession, type MediaMetadataInit } from "./sync";

export interface Listening {
  /** Call synchronously from the Join click handler (a user gesture). */
  join(programme: Programme, anon: boolean): void;
  leave(): void;
  /** The two audio elements the player uses, once joined (diagnostics and e2e). */
  audioElements(): readonly HTMLAudioElement[];
  outputLatencyMs(): number;
}

interface ControllerHooks {
  surahs: () => readonly Surah[] | null;
  onProgrammeReloaded: (programme: Programme) => void;
}

function setMediaMetadata({ title, artist }: MediaMetadataInit): void {
  if (typeof navigator === "undefined" || !navigator.mediaSession || typeof MediaMetadata === "undefined") return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title,
    artist,
    album: "Tilawah",
    artwork: [
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
  });
}

function createListeningController(): Listening & { configure(hooks: ControllerHooks): void } {
  let hooks: ControllerHooks = { surahs: () => null, onProgrammeReloaded: () => undefined };
  let pool: AudioPool<HTMLAudioElement> | null = null;
  let session: ListeningSession | null = null;
  let current: { programme: Programme; anon: boolean } | null = null;
  let latencyMs = 0;
  const triedVersions = new Set<string>();

  const start = (programme: Programme, anon: boolean) => {
    const config = getConfig();
    current = { programme, anon };
    const s = createListeningSession({
      programme,
      wsUrl: config.wsUrl,
      anon,
      loadTimings,
      rateMax: config.rateNudgeMax,
      outputLatencyMs: latencyMs,
      setMediaMetadata,
      surahName: (n) => {
        const name = hooks.surahs()?.find((x) => x.number === n)?.nameTransliterated;
        return name ? `Surah ${name}` : `Surah ${n}`;
      },
      onProgrammeChanged: (version) => void reload(s, version, config.programmeUrl),
      deps: { createAudio: () => pool!.createAudio() },
    });
    session = s;
    s.join();
  };

  /**
   * The server runs a different programme: fetch it fresh and restart on it.
   * The page already has user activation and the elements are unlocked.
   */
  const reload = async (s: ListeningSession, version: string, programmeUrl: string) => {
    if (triedVersions.has(version)) return;
    triedVersions.add(version);
    try {
      const next = await loadProgramme(`${programmeUrl}?v=${encodeURIComponent(version)}`);
      if (!current || session !== s || next.version === current.programme.version) return;
      s.leave();
      hooks.onProgrammeReloaded(next);
      start(next, current.anon);
    } catch {
      /* keep playing the programme we have */
    }
  };

  return {
    configure(h) {
      hooks = h;
    },
    join(programme, anon) {
      if (session) return;
      // Everything up to the socket connect runs synchronously inside the click.
      pool ??= createAudioPool(2, () => new Audio());
      pool.unlock();
      latencyMs = probeOutputLatencyMs();
      start(programme, anon);
    },
    leave() {
      session?.leave();
      session = null;
      current = null;
    },
    audioElements: () => pool?.elements ?? [],
    outputLatencyMs: () => latencyMs,
  };
}

/** Owns the listening session behind the Join / Leave buttons. */
export function useListening(options: {
  surahs: readonly Surah[] | null;
  onProgrammeReloaded?: (programme: Programme) => void;
}): Listening {
  const [controller] = useState(createListeningController);
  const { surahs, onProgrammeReloaded } = options;
  useEffect(() => {
    controller.configure({ surahs: () => surahs, onProgrammeReloaded: (p) => onProgrammeReloaded?.(p) });
  }, [controller, surahs, onProgrammeReloaded]);
  useEffect(() => () => controller.leave(), [controller]);
  return controller;
}

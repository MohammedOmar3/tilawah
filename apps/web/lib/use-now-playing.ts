"use client";

import { ayahAt, positionAt, type CompiledProgramme, type Surah, type Timings, type Track } from "@tilawah/contracts";
import { useEffect, useState } from "react";
import { loadTimings as defaultLoadTimings } from "./data/loaders";
import { useListeningStore, type ListeningStoreApi } from "./sync";
import { browserNow } from "./sync/runtime";

export const NOW_PLAYING_TICK_MS = 250;

export interface NowPlayingInfo {
  trackIndex: number;
  track: Track;
  surah: Surah | null;
  posInTrackMs: number;
  msToNextTrack: number;
  ayah: number;
  /** True until the listener has joined and the clock is synced. */
  approximate: boolean;
}

export interface UseNowPlayingOptions {
  now?: () => number;
  store?: ListeningStoreApi;
  loadTimings?: (url: string) => Promise<Timings>;
}

/**
 * What is being recited. Before joining it is derived from the local clock
 * (approximate); once joined, the listening store (synced clock) wins.
 */
export function useNowPlaying(
  compiled: CompiledProgramme | null,
  surahs: readonly Surah[] | null,
  options: UseNowPlayingOptions = {},
): NowPlayingInfo | null {
  const now = options.now ?? browserNow;
  const loadTimings = options.loadTimings ?? defaultLoadTimings;
  const useStore = options.store ?? useListeningStore;
  const status = useStore((s) => s.status);
  const storeTrack = useStore((s) => s.trackIndex);
  const storePos = useStore((s) => s.posInTrackMs);
  const storeAyah = useStore((s) => s.ayah);
  const storeApprox = useStore((s) => s.approximate);
  const joined = status !== "idle";

  const [localNow, setLocalNow] = useState(() => now());
  const [timings, setTimings] = useState<ReadonlyMap<string, Timings>>(new Map());

  useEffect(() => {
    if (!compiled || joined) return;
    const tick = () => setLocalNow(now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, NOW_PLAYING_TICK_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
    // `now` is a stable clock source; restarting on identity changes would only add churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compiled, joined]);

  const local = compiled ? positionAt(compiled, localNow) : null;
  const trackIndex = joined ? storeTrack : (local?.trackIndex ?? 0);
  const track = compiled?.programme.tracks[trackIndex];
  const timingsUrl = !joined && track ? track.timings : null;

  useEffect(() => {
    if (!timingsUrl || timings.has(timingsUrl)) return;
    let live = true;
    loadTimings(timingsUrl)
      .then((t) => {
        if (live) setTimings((m) => new Map(m).set(timingsUrl, t));
      })
      .catch(() => {
        /* the ayah stays at the opening until a later tick retries */
      });
    return () => {
      live = false;
    };
  }, [timingsUrl, timings, loadTimings]);

  if (!compiled || !surahs || !track || !local) return null;
  const surah = surahs.find((s) => s.number === track.surah) ?? null;
  if (joined) {
    return {
      trackIndex,
      track,
      surah,
      posInTrackMs: storePos,
      msToNextTrack: Math.max(0, track.durationMs - storePos),
      ayah: storeAyah,
      approximate: storeApprox,
    };
  }
  const segs = timings.get(track.timings)?.segments;
  return {
    trackIndex,
    track,
    surah,
    posInTrackMs: local.posInTrackMs,
    msToNextTrack: local.msToNextTrack,
    ayah: segs ? ayahAt(segs, local.posInTrackMs) : 0,
    approximate: true,
  };
}

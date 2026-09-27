"use client";

import type { Presence } from "@tilawah/contracts";
import fixture from "@tilawah/contracts/fixtures/presence.example.json";
import { useEffect, useState } from "react";
import { LazyGlobe } from "@/globe";

// The fixture is already validated by the contracts tests; skip zod on this page.
const initial: Presence = { ...fixture, v: 1 };
const DUBAI = { lat: 25.5, lng: 55.5 };

function addJoins(p: Presence): Presence {
  const joins = p.cells.slice(0, 3).map((c, i) => ({ lat: c.lat, lng: c.lng, n: i + 1 }));
  const added = joins.reduce((s, j) => s + j.n, 0);
  return {
    ...p,
    generatedAt: new Date().toISOString(),
    listeners: p.listeners + added,
    cells: p.cells.map((c) => {
      const j = joins.find((x) => x.lat === c.lat && x.lng === c.lng);
      return j ? { ...c, n: c.n + j.n } : c;
    }),
    joins,
  };
}

function growDubai(p: Presence): Presence {
  return {
    ...p,
    generatedAt: new Date().toISOString(),
    listeners: p.listeners + 500,
    cells: p.cells.map((c) => (c.lat === DUBAI.lat && c.lng === DUBAI.lng ? { ...c, n: c.n + 500 } : c)),
    joins: [{ ...DUBAI, n: 500 }],
  };
}

/** Average frame time over 2 s windows, measured with requestAnimationFrame. */
function useFrameStats(): { fps: number; ms: number } | null {
  const [stats, setStats] = useState<{ fps: number; ms: number } | null>(null);
  useEffect(() => {
    let raf = 0;
    let start = performance.now();
    let frames = 0;
    const tick = (t: number) => {
      frames++;
      if (t - start >= 2000) {
        const ms = (t - start) / frames;
        setStats({ fps: Math.round(1000 / ms), ms: Math.round(ms * 10) / 10 });
        start = t;
        frames = 0;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return stats;
}

const button =
  "rounded-md border border-[#d4af6b]/40 px-3 py-1.5 text-sm text-[#f5deaa] hover:bg-[#d4af6b]/10 focus-visible:outline-2 focus-visible:outline-[#d4af6b]";

export default function GlobeLab() {
  const [presence, setPresence] = useState<Presence>(initial);
  const stats = useFrameStats();

  return (
    <main className="fixed inset-0 bg-[#05080f] text-slate-200">
      <LazyGlobe presence={presence} />
      <div className="absolute left-4 top-4 flex flex-col gap-2">
        <p className="text-sm text-slate-400">
          {presence.listeners} listeners · {presence.countries} countries
        </p>
        <div className="flex gap-2">
          <button type="button" className={button} onClick={() => setPresence(addJoins)}>
            Add joins
          </button>
          <button type="button" className={button} onClick={() => setPresence(growDubai)}>
            Grow Dubai
          </button>
        </div>
        <p data-testid="fps" className="font-mono text-xs text-slate-500">
          {stats ? `${stats.fps} fps · ${stats.ms} ms/frame` : "measuring…"}
        </p>
      </div>
    </main>
  );
}

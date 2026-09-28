"use client";

import type { Presence } from "@tilawah/contracts";
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AUTO_ROTATE_SPEED, FrameDriver, MAX_FRAME_STEP_MS, SETTLE_MS, autoRotateAngle } from "./frames";
import { AUTO_ROTATE_IDLE_MS, autoRotateEnabled, keyToAction } from "./interaction";
import { loadLandDots } from "./land";
import { type GlobeFrame, cellsToPins, centredFrame } from "./layers";
import { type Pulse, schedulePulses } from "./pulses";
import { FOV_DEG, type GlobeColours, GlobeScene, RING_MS } from "./scene";
import { type SkyColours, SkyPainter } from "./sky";
import { usePageVisible } from "./usePageVisible";
import { useReducedMotion } from "./useReducedMotion";

export type { GlobeFrame } from "./layers";

export interface GlobeProps {
  presence: Presence;
  /** The presence refresh interval; a snapshot's join pulses are spread across it. */
  pulseIntervalMs?: number;
  /**
   * Where the globe sits in its container (CSS pixels). It glides there when
   * this changes, which is the zoom on join. Default: centred.
   */
  frame?: GlobeFrame | null;
  className?: string;
}

/** Long enough for the glide to a new frame to finish. */
const GLIDE_MS = 2500;
/** Wheel zoom: size multiplier per 100 px of scroll. */
const WHEEL_ZOOM = 1.08;

function countriesLabel(countries: number): string {
  if (countries === 0) return "Globe showing where people are listening";
  return `Globe showing listeners in ${countries} ${countries === 1 ? "country" : "countries"}`;
}

/** The theme's globe and sky colours, from the CSS tokens on <html>. */
function readColours(reducedMotion: boolean): { globe: GlobeColours; sky: SkyColours } {
  const style = getComputedStyle(document.documentElement);
  const get = (name: string) => style.getPropertyValue(name).trim();
  const num = (name: string, fallback: number) => {
    const v = parseFloat(get(name));
    return Number.isFinite(v) ? v : fallback;
  };
  return {
    globe: {
      oceanA: get("--g-ocean-a") || "#040a18",
      oceanB: get("--g-ocean-b") || "#13284c",
      rim: get("--g-rim") || "#3f7fb8",
      land: get("--g-land") || "#c9d6f0",
      grid: get("--g-grid") || "#5d86c2",
      atmosphere: get("--g-atmo") || "#4b9fe0",
      atmosphereAlpha: num("--g-atmo-a", 0.9),
      cell: get("--g-cell") || "#f2c75c",
      cellAdditive: num("--g-cell-add", 1) > 0,
      pinA: get("--g-pin-a") || "#ffd66b",
      pinB: get("--g-pin-b") || "#f08a24",
      pinFill: get("--g-pin-fill") || "rgba(10,18,36,.85)",
      landLit: num("--g-land-lit", 1),
    },
    sky: {
      stars: [get("--sky-a") || "#e6ecff", get("--sky-b") || "#ffd98a", get("--sky-c") || "#8fb8ff"],
      starAlpha: num("--sky-alpha", 1),
      additive: num("--sky-add", 1) > 0,
      clouds: [get("--neb-1") || "#1f4796", get("--neb-2") || "#4b2d85", get("--neb-3") || "#0e6173"],
      cloudAlpha: num("--neb-alpha", 0.55),
      twinkle: !reducedMotion,
    },
  };
}

export default function Globe({ presence, pulseIntervalMs = 10_000, frame = null, className }: GlobeProps) {
  const reducedMotion = useReducedMotion();
  const visible = usePageVisible();
  const boxRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<HTMLCanvasElement>(null);
  const skyRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<GlobeScene | null>(null);
  const driverRef = useRef<FrameDriver | null>(null);
  const frameRef = useRef(frame);
  const reducedRef = useRef(reducedMotion);
  const visibleRef = useRef(visible);
  const autoRotateRef = useRef(!reducedMotion);

  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [clock, setClock] = useState<{ last: number | null; now: number }>({ last: null, now: 0 });
  const idleTimer = useRef<number | undefined>(undefined);

  const autoRotate = autoRotateEnabled({ reducedMotion, lastInteractionAt: clock.last, now: clock.now });

  /** Render for a while (a data change, a new frame), unless the page is hidden. */
  const kick = useCallback((ms: number = SETTLE_MS) => {
    if (visibleRef.current) driverRef.current?.kick(ms);
  }, []);

  const markInteraction = useCallback(() => {
    const t = performance.now();
    setClock({ last: t, now: t });
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setClock((c) => ({ ...c, now: performance.now() })), AUTO_ROTATE_IDLE_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(idleTimer.current), []);

  // The scene, the sky and everything bound to the canvases: created once.
  useEffect(() => {
    const box = boxRef.current;
    const gl = glRef.current;
    const skyCanvas = skyRef.current;
    if (!box || !gl || !skyCanvas) return;
    let scene: GlobeScene;
    try {
      scene = new GlobeScene(gl);
    } catch (err) {
      console.warn("Globe unavailable: WebGL could not start", err);
      queueMicrotask(() => setState("error"));
      return;
    }
    sceneRef.current = scene;
    const sky = new SkyPainter();
    const skyCtx = skyCanvas.getContext("2d");
    let skyColours = readColours(reducedRef.current).sky;
    let size = { w: 1, h: 1, pr: 1 };
    let first = true;

    const draw = () => {
      scene.render();
      if (skyCtx) {
        const f = scene.frame;
        sky.paint(
          skyCtx,
          {
            width: skyCanvas.width,
            height: skyCanvas.height,
            pixelRatio: size.pr,
            cx: f.cx,
            cy: f.cy,
            rotY: scene.rotY,
            rotX: scene.rotX,
            time: performance.now() / 1000,
            fovDeg: FOV_DEG,
          },
          skyColours,
        );
      }
      if (first) {
        first = false;
        setState("ready");
      }
    };

    const driver = new FrameDriver({
      onFrame: (dtMs) => {
        const dt = Math.min(dtMs, MAX_FRAME_STEP_MS);
        const angle = autoRotateRef.current && !scene.dragging ? autoRotateAngle(dt, AUTO_ROTATE_SPEED) : 0;
        const settling = scene.step(dt, performance.now(), { autoRotateRad: angle, reducedMotion: reducedRef.current });
        draw();
        if (settling) kick();
      },
      deps: {
        now: () => performance.now(),
        setInterval: (fn, ms) => window.setInterval(fn, ms),
        clearInterval: (id) => window.clearInterval(id as number),
      },
    });
    driverRef.current = driver;

    const applyColours = () => {
      const c = readColours(reducedRef.current);
      scene.setColours(c.globe);
      skyColours = c.sky;
      kick();
    };

    const resize = () => {
      const w = box.clientWidth;
      const h = box.clientHeight;
      const pr = Math.min(window.devicePixelRatio || 1, 2);
      size = { w, h, pr };
      scene.setSize(w, h, pr);
      skyCanvas.width = Math.round(w * pr);
      skyCanvas.height = Math.round(h * pr);
      scene.setFrame(frameRef.current ?? centredFrame(w, h), true);
      kick();
    };

    applyColours();
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(box);

    // Theme changes: the Night / Fajr choice on <html>, or the device theme under Auto.
    const themeObserver = new MutationObserver(applyColours);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", applyColours);

    const onDown = (e: PointerEvent) => {
      scene.startDrag(e.clientX, e.clientY);
      gl.setPointerCapture(e.pointerId);
      markInteraction();
      kick();
    };
    const onMove = (e: PointerEvent) => {
      if (!scene.dragging) return;
      scene.moveDrag(e.clientX, e.clientY);
      kick();
    };
    const onUp = () => {
      scene.endDrag();
      kick(1500);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      scene.zoomBy(Math.pow(WHEEL_ZOOM, -e.deltaY / 100));
      markInteraction();
      kick();
    };
    gl.addEventListener("pointerdown", onDown);
    gl.addEventListener("pointermove", onMove);
    gl.addEventListener("pointerup", onUp);
    gl.addEventListener("pointercancel", onUp);
    gl.addEventListener("wheel", onWheel, { passive: false });

    // Land dots arrive a moment later; the globe draws its ocean meanwhile.
    let cancelled = false;
    loadLandDots()
      .then((dots) => {
        if (cancelled) return;
        scene.setLand(dots.points);
        kick();
      })
      .catch((err: unknown) => console.warn("Globe land dots unavailable", err));

    return () => {
      cancelled = true;
      observer.disconnect();
      themeObserver.disconnect();
      scheme.removeEventListener("change", applyColours);
      gl.removeEventListener("pointerdown", onDown);
      gl.removeEventListener("pointermove", onMove);
      gl.removeEventListener("pointerup", onUp);
      gl.removeEventListener("pointercancel", onUp);
      gl.removeEventListener("wheel", onWheel);
      driver.dispose();
      driverRef.current = null;
      scene.dispose();
      sceneRef.current = null;
    };
  }, [kick, markInteraction]);

  // Glide to a new frame (the zoom on join, the translation toggle, a resize).
  useEffect(() => {
    frameRef.current = frame;
    const scene = sceneRef.current;
    if (!scene || !frame) return;
    scene.setFrame(frame, reducedMotion);
    kick(GLIDE_MS);
  }, [frame, reducedMotion, kick]);

  // Listener pins.
  const pins = useMemo(() => cellsToPins(presence.cells), [presence.cells]);
  useEffect(() => {
    sceneRef.current?.setPins(pins);
    kick();
  }, [pins, kick, state]);

  // Join pulses, spread across the next interval. `data-rings` counts this
  // schedule's pulses that have not finished yet.
  const scheduled = useMemo(
    () => schedulePulses(presence.joins, { intervalMs: pulseIntervalMs, reducedMotion }),
    [presence.joins, pulseIntervalMs, reducedMotion],
  );
  const [finished, setFinished] = useState<{ of: Pulse[]; n: number }>({ of: [], n: 0 });
  const ringCount = scheduled.length - (finished.of === scheduled ? finished.n : 0);
  useEffect(() => {
    if (scheduled.length === 0) return;
    const timers = scheduled.flatMap((p) => [
      window.setTimeout(() => {
        sceneRef.current?.addRing(p.lat, p.lng, performance.now());
        kick(RING_MS);
      }, p.atMs),
      window.setTimeout(
        () => setFinished((f) => ({ of: scheduled, n: f.of === scheduled ? f.n + 1 : 1 })),
        p.atMs + RING_MS,
      ),
    ]);
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [scheduled, kick]);

  // Continuous frames while something always moves (rotation, twinkle); on
  // demand under reduced motion; none while the page is hidden.
  useEffect(() => {
    reducedRef.current = reducedMotion;
    visibleRef.current = visible;
    autoRotateRef.current = autoRotate;
    const driver = driverRef.current;
    if (!driver) return;
    driver.setContinuous(visible && !reducedMotion);
    if (visible) driver.kick(SETTLE_MS);
  }, [visible, reducedMotion, autoRotate, state]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const action = keyToAction(e.key);
      if (!action) return;
      e.preventDefault();
      markInteraction();
      sceneRef.current?.apply(action);
      kick();
    },
    [markInteraction, kick],
  );

  return (
    <div
      ref={boxRef}
      role="img"
      aria-label={countriesLabel(presence.countries)}
      tabIndex={0}
      onKeyDown={onKeyDown}
      data-globe-state={state}
      data-autorotate={String(autoRotate)}
      data-frameloop={visible ? "demand" : "never"}
      data-rings={ringCount}
      className={`relative h-full w-full outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--gold)] ${className ?? ""}`}
    >
      <canvas ref={skyRef} aria-hidden="true" className="pointer-events-none absolute inset-0 block h-full w-full" />
      <canvas
        ref={glRef}
        aria-hidden="true"
        className="absolute inset-0 block h-full w-full cursor-grab touch-none active:cursor-grabbing"
      />
    </div>
  );
}

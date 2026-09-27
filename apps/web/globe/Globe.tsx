"use client";

import type { Presence } from "@tilawah/contracts";
import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { type ComponentRef, type KeyboardEvent, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MeshPhongMaterial, Spherical } from "three";
import ThreeGlobe from "three-globe";
import {
  AUTO_ROTATE_IDLE_MS,
  DEFAULT_DISTANCE,
  MAX_DISTANCE,
  MIN_DISTANCE,
  ZOOM_STEP,
  type GlobeAction,
  autoRotateEnabled,
  clampDistance,
  clampTilt,
  keyToAction,
} from "./interaction";
import { AUTO_ROTATE_SPEED, FrameDriver, SETTLE_MS, autoRotateAngle } from "./frames";
import { loadLand } from "./land";
import { type GlobePoint, cellsToPoints, colourFor, colourForWeight, heightFor } from "./layers";
import { type Pulse, schedulePulses } from "./pulses";
import { usePageVisible } from "./usePageVisible";
import { useReducedMotion } from "./useReducedMotion";

export interface GlobeProps {
  presence: Presence;
  /** The presence refresh interval; a snapshot's join pulses are spread across it. */
  pulseIntervalMs?: number;
  className?: string;
}

type Controls = ComponentRef<typeof OrbitControls>;
type HexBin = { points: object[]; sumWeight: number };
type Ring = { lat: number; lng: number };

/** A ring lives this long after it starts (its propagation takes 2 s). */
const RING_LIFETIME_MS = 2400;
const LAND_DOT_COLOUR = "rgba(160, 174, 192, 0.35)";
const ringColour = () => (t: number) => `rgba(245,222,170,${1 - t})`;
const DEG = Math.PI / 180;
/** How long three-globe animates hexbin height changes. */
const HEX_TRANSITION_MS = 1200;

function countriesLabel(countries: number): string {
  if (countries === 0) return "Globe showing where people are listening";
  return `Globe showing listeners in ${countries} ${countries === 1 ? "country" : "countries"}`;
}

/** Moves the orbit camera for a keyboard action. */
function applyAction(controls: Controls, action: GlobeAction): void {
  const camera = controls.object;
  const offset = camera.position.clone().sub(controls.target);
  const s = new Spherical().setFromVector3(offset);
  switch (action.type) {
    case "rotate":
      s.theta += action.degrees * DEG;
      break;
    case "tilt": {
      // Spherical.phi is measured from the +y pole; latitude = 90° − phi.
      const lat = 90 - s.phi / DEG;
      s.phi = (90 - clampTilt(lat + action.degrees)) * DEG;
      break;
    }
    case "zoom":
      s.radius = clampDistance(action.direction === "in" ? s.radius / ZOOM_STEP : s.radius * ZOOM_STEP);
      break;
    case "reset":
      s.set(DEFAULT_DISTANCE, Math.PI / 2, 0);
      break;
  }
  s.makeSafe();
  camera.position.setFromSpherical(s).add(controls.target);
  camera.lookAt(controls.target);
  controls.update();
}

interface DemandFramesProps {
  controls: RefObject<Controls | null>;
  /** Frames are wanted at all (the page is visible). */
  enabled: boolean;
  autoRotate: boolean;
  /** Something moves until further notice (auto-rotation, live rings). */
  continuous: boolean;
  /** Changes identity whenever the scene's data changes. */
  changed: unknown;
  /** How long to keep rendering after a data change. */
  settleMs: number;
}

/**
 * Drives the `frameloop="demand"` canvas: requests frames at a capped rate
 * while the globe moves and advances its auto-rotation by elapsed time, so it
 * turns at the same speed at any frame rate. OrbitControls still requests its
 * own frames while the user drags.
 */
function DemandFrames({ controls, enabled, autoRotate, continuous, changed, settleMs }: DemandFramesProps) {
  const invalidate = useThree((s) => s.invalidate);
  const driver = useRef<FrameDriver | null>(null);
  const autoRotateRef = useRef(autoRotate);
  const continuousRef = useRef(enabled && continuous);

  useEffect(() => {
    const d = new FrameDriver({
      onFrame: (dtMs) => {
        const c = controls.current;
        if (autoRotateRef.current && c && dtMs > 0) {
          // OrbitControls' autoRotate turns the camera left (theta decreases).
          applyAction(c, { type: "rotate", degrees: -autoRotateAngle(dtMs, AUTO_ROTATE_SPEED) / DEG });
        }
        invalidate();
      },
      deps: {
        now: () => performance.now(),
        setInterval: (fn, ms) => window.setInterval(fn, ms),
        clearInterval: (id) => window.clearInterval(id as number),
      },
    });
    driver.current = d;
    d.setContinuous(continuousRef.current);
    return () => {
      d.dispose();
      driver.current = null;
    };
  }, [controls, invalidate]);

  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    continuousRef.current = enabled && continuous;
    driver.current?.setContinuous(continuousRef.current);
  }, [enabled, continuous]);

  useEffect(() => {
    if (enabled) driver.current?.kick(settleMs);
  }, [enabled, changed, settleMs]);

  return null;
}

export default function Globe({ presence, pulseIntervalMs = 10_000, className }: GlobeProps) {
  const reducedMotion = useReducedMotion();
  const visible = usePageVisible();
  const controlsRef = useRef<Controls>(null);

  const [globeReady, setGlobeReady] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);
  const [landVersion, setLandVersion] = useState(0);
  const [clock, setClock] = useState<{ last: number | null; now: number }>({ last: null, now: 0 });
  const idleTimer = useRef<number | undefined>(undefined);

  const globe = useMemo(
    () =>
      new ThreeGlobe({ animateIn: false })
        .showGlobe(true)
        .globeMaterial(new MeshPhongMaterial({ color: "#0b1320" }))
        .showAtmosphere(true)
        .atmosphereColor("#d4af6b")
        .atmosphereAltitude(0.12)
        .hexPolygonResolution(3)
        .hexPolygonMargin(0.4)
        .hexPolygonColor(() => LAND_DOT_COLOUR)
        .hexBinPointWeight("weight")
        .hexBinResolution(3)
        .ringColor(ringColour)
        .ringMaxRadius(3)
        .ringPropagationSpeed(1.5)
        .ringRepeatPeriod(0)
        .onGlobeReady(() => setGlobeReady(true)),
    [],
  );

  // Land dots, fetched once per page load.
  useEffect(() => {
    let cancelled = false;
    loadLand()
      .then((land) => {
        if (cancelled) return;
        globe.hexPolygonsData(land.features);
        setLandVersion((v) => v + 1);
      })
      .catch((err: unknown) => console.warn("Globe land outlines unavailable", err));
    return () => {
      cancelled = true;
    };
  }, [globe]);

  // Listener hexbins.
  const points = useMemo(() => cellsToPoints(presence.cells), [presence.cells]);
  useEffect(() => {
    const maxN = points.reduce((m, p) => Math.max(m, p.weight), 1);
    globe
      .hexTransitionDuration(reducedMotion ? 0 : HEX_TRANSITION_MS)
      .hexAltitude((d: HexBin) => heightFor(d.sumWeight))
      .hexTopColor((d: HexBin) => colourForWeight(d.sumWeight, maxN))
      .hexSideColor((d: HexBin) => colourFor((Math.log(Math.max(1, d.sumWeight)) / Math.log(Math.max(2, maxN))) * 0.5))
      .hexBinPointsData(points satisfies GlobePoint[]);
  }, [globe, points, reducedMotion]);

  // Join pulses, spread across the next interval. Each ring is added at its time
  // and removed once it has faded.
  // `data-rings` counts this schedule's pulses that have not finished yet.
  const scheduled = useMemo(
    () => schedulePulses(presence.joins, { intervalMs: pulseIntervalMs, reducedMotion }),
    [presence.joins, pulseIntervalMs, reducedMotion],
  );
  const [finished, setFinished] = useState<{ of: Pulse[]; n: number }>({ of: [], n: 0 });
  const ringCount = scheduled.length - (finished.of === scheduled ? finished.n : 0);
  useEffect(() => {
    if (scheduled.length === 0) return;
    const live = new Set<Ring>();
    const sync = () => globe.ringsData([...live]);
    const timers = scheduled.flatMap((p) => {
      const ring: Ring = { lat: p.lat, lng: p.lng };
      return [
        window.setTimeout(() => {
          live.add(ring);
          sync();
        }, p.atMs),
        window.setTimeout(() => {
          live.delete(ring);
          sync();
          setFinished((f) => ({ of: scheduled, n: f.of === scheduled ? f.n + 1 : 1 }));
        }, p.atMs + RING_LIFETIME_MS),
      ];
    });
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      live.clear();
      sync();
    };
  }, [globe, scheduled]);

  // three-globe runs its own animation ticker: stop it while hidden or unmounted.
  useEffect(() => {
    if (!visible) return;
    globe.resumeAnimation();
    return () => {
      globe.pauseAnimation();
    };
  }, [globe, visible]);

  const markInteraction = useCallback(() => {
    const t = performance.now();
    setClock({ last: t, now: t });
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(
      () => setClock((c) => ({ ...c, now: performance.now() })),
      AUTO_ROTATE_IDLE_MS,
    );
  }, []);
  useEffect(() => () => window.clearTimeout(idleTimer.current), []);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const action = keyToAction(e.key);
      if (!action) return;
      e.preventDefault();
      markInteraction();
      if (controlsRef.current) applyAction(controlsRef.current, action);
    },
    [markInteraction],
  );

  const autoRotate = autoRotateEnabled({ reducedMotion, lastInteractionAt: clock.last, now: clock.now });
  const frameloop = visible ? "demand" : "never";
  const ready = globeReady && canvasReady;
  // Anything that changes what the globe draws, apart from motion.
  const changed = useMemo(() => ({ points, landVersion, globeReady }), [points, landVersion, globeReady]);

  return (
    <div
      role="img"
      aria-label={countriesLabel(presence.countries)}
      tabIndex={0}
      onKeyDown={onKeyDown}
      data-globe-state={ready ? "ready" : "loading"}
      data-autorotate={String(autoRotate)}
      data-frameloop={frameloop}
      data-rings={ringCount}
      className={`relative h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#d4af6b]/50 ${className ?? ""}`}
    >
      <Canvas
        dpr={[1, 2]}
        frameloop={frameloop}
        camera={{ position: [0, 0, DEFAULT_DISTANCE], fov: 45, near: 1, far: 2000 }}
        gl={{ antialias: true, powerPreference: "low-power" }}
        onCreated={() => setCanvasReady(true)}
      >
        <ambientLight intensity={0.8} color="#cbd5e1" />
        <directionalLight position={[-200, 150, 250]} intensity={1.2} color="#fff5e0" />
        <primitive object={globe} />
        <OrbitControls
          ref={controlsRef}
          enablePan={false}
          minDistance={MIN_DISTANCE}
          maxDistance={MAX_DISTANCE}
          enableDamping
          rotateSpeed={0.4}
          zoomSpeed={0.6}
          onStart={markInteraction}
        />
        <DemandFrames
          controls={controlsRef}
          enabled={visible}
          autoRotate={autoRotate}
          continuous={autoRotate || ringCount > 0}
          changed={changed}
          settleMs={reducedMotion ? SETTLE_MS : HEX_TRANSITION_MS + SETTLE_MS}
        />
      </Canvas>
    </div>
  );
}

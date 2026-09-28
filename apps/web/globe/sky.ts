/**
 * The sky behind the globe, drawn on its own 2D canvas. (WebGL point sprites
 * and large textured sprites render as coloured noise on iOS Safari, so the
 * sky stays out of WebGL.) Two star layers turn with the globe at different
 * speeds for depth, with a dusty band and a few soft clouds.
 */

type Dir = [number, number, number];

export interface SkyColours {
  /** Star colours: most stars, warm ones, cool ones. */
  stars: [string, string, string];
  starAlpha: number;
  /** Additive blending (Night); normal blending on the light theme. */
  additive: boolean;
  clouds: [string, string, string];
  cloudAlpha: number;
  /** Stars twinkle unless the listener asks for reduced motion. */
  twinkle: boolean;
}

export interface SkyView {
  /** Canvas size in device pixels, and device pixels per CSS pixel. */
  width: number;
  height: number;
  pixelRatio: number;
  /** The globe's centre in CSS pixels; the sky is projected around it. */
  cx: number;
  cy: number;
  /** The globe's rotation (radians) about its vertical and horizontal axes. */
  rotY: number;
  rotX: number;
  /** Seconds, for the twinkle. */
  time: number;
  /** Vertical field of view in degrees. */
  fovDeg: number;
}

interface StarLayer {
  dirs: Float32Array;
  /** Per star: brightness seed, in the band (1) or not (0), colour seed. */
  info: Float32Array;
  count: number;
  /** Near stars turn faster than far ones. */
  speed: number;
}

const BAND_WIDTH = 0.16;

/** Rotates a direction into the tilted plane of the star band. */
function band([x, y, z]: Dir): Dir {
  const ca = Math.cos(1.05);
  const sa = Math.sin(1.05);
  const cb = Math.cos(0.35);
  const sb = Math.sin(0.35);
  const cc = Math.cos(0.55);
  const sc = Math.sin(0.55);
  const y1 = y * ca - z * sa;
  const z1 = y * sa + z * ca;
  const x2 = x * cb + z1 * sb;
  const z2 = -x * sb + z1 * cb;
  return [x2 * cc - y1 * sc, x2 * sc + y1 * cc, z2];
}

function randomDir(random: () => number): Dir {
  const u = random() * 2 - 1;
  const t = random() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return [s * Math.cos(t), u, s * Math.sin(t)];
}

function bandDir(random: () => number): Dir {
  const a = random() * Math.PI * 2;
  const h = (random() + random() + random() - 1.5) * BAND_WIDTH;
  const l = Math.hypot(1, h);
  return band([Math.cos(a) / l, h / l, Math.sin(a) / l]);
}

function makeLayer(count: number, bandFraction: number, speed: number, random: () => number): StarLayer {
  const dirs = new Float32Array(count * 3);
  const info = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const inBand = random() < bandFraction;
    dirs.set(inBand ? bandDir(random) : randomDir(random), i * 3);
    info.set([random(), inBand ? 1 : 0, random()], i * 3);
  }
  return { dirs, info, count, speed };
}

function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  if (!Number.isFinite(n)) return `rgba(255,255,255,${alpha})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export class SkyPainter {
  private readonly layers: StarLayer[];
  private readonly clouds: { dir: Dir; radius: number; tone: 0 | 1 | 2 }[];

  constructor(random: () => number = Math.random, density = 1) {
    this.layers = [
      makeLayer(Math.round(6500 * density), 0.55, 0.12, random),
      makeLayer(Math.round(1300 * density), 0.1, 0.26, random),
    ];
    this.clouds = Array.from({ length: 12 }, (_, i) => ({
      dir: i < 9 ? bandDir(random) : randomDir(random),
      radius: 0.28 + random() * 0.3,
      tone: (i % 3) as 0 | 1 | 2,
    }));
  }

  get starCount(): number {
    return this.layers.reduce((n, l) => n + l.count, 0);
  }

  paint(ctx: CanvasRenderingContext2D, view: SkyView, colours: SkyColours): void {
    const { width: W, height: H, pixelRatio: pr } = view;
    ctx.clearRect(0, 0, W, H);
    const F = H / (2 * Math.tan((view.fovDeg * Math.PI) / 360));
    const ox = view.cx * pr;
    const oy = view.cy * pr;
    const rot = (k: number) => {
      const ay = view.rotY * k;
      const ax = view.rotX * k;
      return [Math.cos(ay), Math.sin(ay), Math.cos(ax), Math.sin(ax)] as const;
    };
    const project = (x: number, y: number, z: number, r: readonly number[]): [number, number] | null => {
      const x1 = x * r[0]! + z * r[1]!;
      const z1 = -x * r[1]! + z * r[0]!;
      const y1 = y * r[2]! - z1 * r[3]!;
      const z2 = y * r[3]! + z1 * r[2]!;
      if (z2 > -0.08) return null;
      return [ox + (x1 / -z2) * F, oy - (y1 / -z2) * F];
    };

    ctx.globalCompositeOperation = colours.additive ? "lighter" : "source-over";
    const cloudRot = rot(0.12);
    for (const c of this.clouds) {
      const p = project(c.dir[0], c.dir[1], c.dir[2], cloudRot);
      if (!p) continue;
      const R = c.radius * F;
      if (p[0] < -R || p[0] > W + R || p[1] < -R || p[1] > H + R) continue;
      const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], R);
      const col = colours.clouds[c.tone];
      g.addColorStop(0, rgba(col, colours.cloudAlpha * 0.42));
      g.addColorStop(0.5, rgba(col, colours.cloudAlpha * 0.16));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      ctx.fillRect(p[0] - R, p[1] - R, 2 * R, 2 * R);
    }

    const t = view.time;
    for (const layer of this.layers) {
      const r = rot(layer.speed);
      const near = layer.speed > 0.2;
      const { dirs, info, count } = layer;
      for (let i = 0; i < count; i++) {
        const p = project(dirs[i * 3]!, dirs[i * 3 + 1]!, dirs[i * 3 + 2]!, r);
        if (!p || p[0] < 0 || p[0] > W || p[1] < 0 || p[1] > H) continue;
        const seed = info[i * 3]!;
        const inBand = info[i * 3 + 1]! > 0;
        const hue = info[i * 3 + 2]!;
        const tw = colours.twinkle ? 0.6 + 0.4 * Math.sin(t * (0.4 + seed * 1.3) + seed * 60) : 1;
        const a = (inBand ? 0.25 + 0.45 * seed : 0.3 + 0.7 * seed) * tw * colours.starAlpha;
        const s = (inBand ? 0.6 + seed * 0.7 : 0.7 + seed * 0.9 + Math.pow(seed, 8) * (near ? 3.2 : 2.2)) * pr;
        ctx.fillStyle = colours.stars[hue < 0.15 ? 1 : hue > 0.82 ? 2 : 0];
        ctx.globalAlpha = a;
        if (s < 1.6 * pr) {
          ctx.fillRect(p[0] - s / 2, p[1] - s / 2, s, s);
        } else {
          ctx.beginPath();
          ctx.arc(p[0], p[1], s * 0.55, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = a * 0.18;
          ctx.beginPath();
          ctx.arc(p[0], p[1], s * 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
}

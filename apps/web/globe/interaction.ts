/** Auto-rotation resumes this long after the last user interaction. */
export const AUTO_ROTATE_IDLE_MS = 10_000;
/** Camera distance limits; three-globe's radius is 100. */
export const MIN_DISTANCE = 180;
export const MAX_DISTANCE = 500;
export const DEFAULT_DISTANCE = 320;
/** Keyboard tilt limit, in degrees above or below the equator. */
export const MAX_TILT_DEG = 60;
/** Keyboard zoom step, as a distance multiplier. */
export const ZOOM_STEP = 1.2;

export function autoRotateEnabled(input: {
  reducedMotion: boolean;
  lastInteractionAt: number | null;
  now: number;
}): boolean {
  if (input.reducedMotion) return false;
  if (input.lastInteractionAt === null) return true;
  return input.now - input.lastInteractionAt >= AUTO_ROTATE_IDLE_MS;
}

export type GlobeAction =
  | { type: "rotate"; degrees: number }
  | { type: "tilt"; degrees: number }
  | { type: "zoom"; direction: "in" | "out" }
  | { type: "reset" };

export function keyToAction(key: string): GlobeAction | null {
  switch (key) {
    case "ArrowLeft":
      return { type: "rotate", degrees: -15 };
    case "ArrowRight":
      return { type: "rotate", degrees: 15 };
    case "ArrowUp":
      return { type: "tilt", degrees: 10 };
    case "ArrowDown":
      return { type: "tilt", degrees: -10 };
    case "+":
    case "=":
      return { type: "zoom", direction: "in" };
    case "-":
      return { type: "zoom", direction: "out" };
    case "0":
      return { type: "reset" };
    default:
      return null;
  }
}

export function clampTilt(degrees: number): number {
  return Math.min(MAX_TILT_DEG, Math.max(-MAX_TILT_DEG, degrees));
}

export function clampDistance(d: number): number {
  return Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, d));
}

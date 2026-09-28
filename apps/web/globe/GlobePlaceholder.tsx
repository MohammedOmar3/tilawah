/**
 * Shown while the three.js chunk loads. The page's own background glow shows
 * through, so nothing jumps when the globe arrives. Pure CSS, free at first paint.
 */
export default function GlobePlaceholder() {
  return <div aria-hidden="true" data-globe-state="loading" className="h-full w-full" />;
}

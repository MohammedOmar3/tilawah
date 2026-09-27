/**
 * Shown while the three.js chunk loads: a dim disc the size of the rendered
 * globe (radius 100 seen from 320 units at 45° fov fills ~75% of the height).
 * Pure CSS, so it costs nothing at first paint.
 */
export default function GlobePlaceholder() {
  return (
    <div
      aria-hidden="true"
      data-globe-state="loading"
      className="relative flex h-full w-full items-center justify-center"
    >
      <div
        className="aspect-square h-[75%] max-w-full rounded-full"
        style={{
          background:
            "radial-gradient(circle at 40% 35%, rgba(24, 36, 56, 0.9) 0%, rgba(11, 19, 32, 0.85) 55%, rgba(11, 19, 32, 0) 72%)",
          boxShadow: "0 0 60px 6px rgba(212, 175, 107, 0.08)",
        }}
      />
    </div>
  );
}

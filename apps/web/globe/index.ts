// Public surface of the globe. Only the lazy wrapper and types are exported, so
// importing `@/globe` never pulls three.js into the importing page's chunk.
export { default as LazyGlobe } from "./LazyGlobe";
export type { GlobeFrame, GlobeProps } from "./Globe";

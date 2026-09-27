"use client";

import dynamic from "next/dynamic";
import GlobePlaceholder from "./GlobePlaceholder";

/**
 * The globe in its own chunk: three.js, R3F and three-globe load after first
 * paint and only in the browser. The placeholder holds the space meanwhile.
 */
const LazyGlobe = dynamic(() => import("./Globe"), {
  ssr: false,
  loading: () => <GlobePlaceholder />,
});

export default LazyGlobe;

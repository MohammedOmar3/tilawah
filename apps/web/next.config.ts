import type { NextConfig } from "next";

const config: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  transpilePackages: ["@tilawah/contracts"],
  reactStrictMode: true,
};

export default config;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output is what the Dockerfile and scripts/smoke.sh boot.
  // Vercel ignores it and builds its own server bundle.
  output: "standalone",
};

export default nextConfig;

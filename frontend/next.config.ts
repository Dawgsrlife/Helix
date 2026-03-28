import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Reduce memory pressure in dev mode
  experimental: {
    // Limit parallel compilation workers
    workerThreads: false,
    cpus: 2,
  },
};

export default nextConfig;

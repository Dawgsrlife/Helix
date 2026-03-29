import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Point turbopack to the frontend directory explicitly
    // This prevents it from using C:\Users\33576\bun.lock as the root
    root: process.cwd(),
  },
  experimental: {
    workerThreads: false,
    cpus: 2,
  },
};

export default nextConfig;

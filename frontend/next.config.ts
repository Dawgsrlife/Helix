import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  experimental: {
    workerThreads: false,
    cpus: 2,
  },
};

export default nextConfig;

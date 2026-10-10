import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The project folder is the root, even if a stray package-lock.json exists in a parent folder.
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;

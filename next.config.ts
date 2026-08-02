import type { NextConfig } from "next";

import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: { root: path.join(import.meta.dirname ?? process.cwd()) },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "assets.clawcorp.ai",
        pathname: "/**",
      },
    ],
    formats: ["image/webp"],
  },
};

export default nextConfig;

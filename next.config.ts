import type { NextConfig } from "next";

import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: { root: path.join(import.meta.dirname ?? process.cwd()) },
  images: {
    // The deployment target has no runtime image processing, so images are
    // resolved to prebuilt WebP variants (scripts/generate-variants.mjs).
    loader: "custom",
    loaderFile: "./src/lib/image-loader.ts",
    deviceSizes: [384, 640, 1024],
    imageSizes: [256],
  },
};

export default nextConfig;

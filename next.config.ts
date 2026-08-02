import type { NextConfig } from "next";

import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: { root: path.join(import.meta.dirname ?? process.cwd()) },
  experimental: {
    serverActions: {
      // Files never travel through a Server Action — they are posted to
      // /api/uploads instead (see src/lib/uploads.ts). This headroom is only
      // for large JSON payloads such as a storefront layout, so an over-limit
      // body cannot come back as an unhandleable server error.
      bodySizeLimit: "2mb",
    },
  },
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

import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import path from "node:path";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  turbopack: { root: path.join(import.meta.dirname ?? process.cwd()) },
  // Left to the adapter's bundler, which includes it once: bundled by Next,
  // every route group that reaches it carried its own multi-megabyte copy.
  serverExternalPackages: ["cloudflare"],
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

export default withNextIntl(nextConfig);

// Gives `next dev` the Worker bindings, such as the BUCKET uploads are stored in.
initOpenNextCloudflareForDev();

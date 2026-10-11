import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// The marketing pages under [locale] are prerendered with dynamicParams = false,
// so on Workers they exist only if something serves the build's prerendered
// output. Without an incremental cache every one of them answered 404. This
// read-only cache serves them from the static assets; the site does not use
// revalidation, which is the one thing it cannot do.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
});

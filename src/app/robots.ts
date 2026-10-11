import type { MetadataRoute } from "next";
import { PRIVATE_PATHS, SITE_ORIGIN } from "@/lib/seo";

/** The platform host: the marketing site and storefronts are open, the workspace is not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: [...PRIVATE_PATHS] },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}

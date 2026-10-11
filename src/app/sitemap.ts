import type { MetadataRoute } from "next";
import { marketingSitemap } from "@/lib/seo";

/** The marketing site in all nine languages. Storefronts each have their own at `/s/<slug>/sitemap.xml`. */
export default function sitemap(): MetadataRoute.Sitemap {
  return marketingSitemap().map((entry) => ({
    url: entry.url,
    ...(entry.languages ? { alternates: { languages: entry.languages } } : {}),
  }));
}

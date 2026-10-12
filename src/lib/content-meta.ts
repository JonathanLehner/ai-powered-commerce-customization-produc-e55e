import type { Metadata } from "next";
import type { Locale } from "@/i18n/locales";
import { contentPath, entrySummary } from "./content";
import { metaDescription } from "./seo";
import { shopperPageMetadata } from "./storefront-meta";
import type { ContentEntry, Store } from "./types";

/**
 * A page's or post's metadata: its own search title and description where the
 * store wrote them, else its title and summary, with hreflang alternates for
 * every language, and its cover as the share image when it has one.
 */
export function contentMetadata(store: Store, locale: Locale, entry: ContentEntry): Metadata {
  const seoTitle = entry.seoTitle.trim();
  const metadata = shopperPageMetadata(store, locale, contentPath(entry.kind, entry.handle), {
    title: seoTitle || entry.title,
    absolute: Boolean(seoTitle),
    description: entry.seoDescription.trim() || metaDescription(entrySummary(entry, 400)),
  });
  if (!entry.coverImageUrl) return metadata;
  const images = [{ url: entry.coverImageUrl, alt: entry.title }];
  return {
    ...metadata,
    openGraph: { ...metadata.openGraph, type: entry.kind === "post" ? "article" : "website", images },
    twitter: { ...metadata.twitter, images },
  };
}

import type { Metadata } from "next";
import { ContentArticle } from "@/components/ContentArticle";
import { notFoundRobots, UnknownStoreView } from "@/components/NotFoundViews";
import { StorefrontNotFoundView } from "@/components/ShopperNotFoundViews";
import { shopperIntl, shopperLocale } from "@/i18n/storefront";
import { storeLanguages } from "@/i18n/storefront-routing";
import { localizeEntry } from "@/lib/content";
import { getPublishedEntry } from "@/lib/content-data";
import { contentMetadata } from "@/lib/content-meta";
import { storefrontBySlug } from "@/lib/storefront-data";

type Params = Promise<{ slug: string; locale: string; handle: string }>;

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, locale, handle } = await params;
  const store = (await storefrontBySlug(slug))?.store ?? null;
  if (!store) return notFoundRobots;
  const entry = await getPublishedEntry(store.id, "page", decode(handle));
  if (!entry) return { title: "Not found", ...notFoundRobots };
  const active = shopperLocale(store, locale);
  return contentMetadata(store, active, localizeEntry(entry, active, storeLanguages(store).defaultLocale));
}

/** One of the store's own pages, such as About or FAQ, in the shopper's language. */
export default async function StorePage({ params }: { params: Params }) {
  const { slug, locale: requested, handle } = await params;
  const store = (await storefrontBySlug(slug))?.store ?? null;
  if (!store) return <UnknownStoreView slug={slug} />;
  const stored = await getPublishedEntry(store.id, "page", decode(handle));
  if (!stored) return <StorefrontNotFoundView store={store} locale={requested} />;
  const { locale } = await shopperIntl(store, requested, `/s/${store.slug}`);
  const entry = localizeEntry(stored, locale, storeLanguages(store).defaultLocale);
  return <ContentArticle title={entry.title} body={entry.body} coverImageUrl={entry.coverImageUrl} />;
}

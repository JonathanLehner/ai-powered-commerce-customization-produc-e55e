/**
 * Browser-tab titles, page descriptions and share previews for the two
 * shopper-facing surfaces — a client storefront and a company's gift portal.
 *
 * Both are white-labelled: the shopper is on the client's shop, not on
 * Parcelith, so nothing here names the platform. The store or catalogue is the
 * title suffix, the description talks about that shop, and the share image is
 * the store's own logo. The one place Parcelith is still named is the small
 * "powered by" line in the footer, which is a credit rather than branding.
 */
import type { Metadata } from "next";
import { fmt, storefrontLocale } from "./i18n";
import { sectionsFromTree } from "./storefront-schema";
import type { GiftCatalogue, Store } from "./types";

/** Sentence-terminating punctuation, including the CJK full stop. */
const SENTENCE_END = /[.!?…。！？]$/;

/** Joins a tagline to the sentence after it without doubling the full stop. */
function asSentence(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return SENTENCE_END.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** Descriptions are a share preview, not an article: keep them short. */
function clamp(text: string, max = 200): string {
  const value = text.trim().replace(/\s+/g, " ");
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

/**
 * A store's own tagline: the headline of the hero it published. Stores that
 * have not published a layout yet, or that opened with a different section,
 * simply have none and fall back to the generic store description.
 */
export function storeTagline(publishedTree: unknown): string | null {
  for (const section of sectionsFromTree(publishedTree)) {
    if (section.type !== "HeroSection") continue;
    const headline = section.props.headline;
    if (typeof headline === "string" && headline.trim()) return headline.trim();
  }
  return null;
}

/** The share image for a shop — its logo, or nothing rather than a stand-in. */
function shareImages(store: Store) {
  return store.logoUrl ? [{ url: store.logoUrl, alt: store.name }] : undefined;
}

/**
 * Metadata for the storefront root layout.
 *
 * `title.template` is what every page below inherits, so a basket reads
 * "Your basket · Northwind Supply Co". `title.default` covers the store home,
 * which sets no title of its own.
 */
export function storefrontMetadata(store: Store, tagline: string | null): Metadata {
  const { t } = storefrontLocale(store);
  const title = fmt(t.meta.homeTitle, { store: store.name });
  const description = clamp(
    tagline
      ? fmt(t.meta.taglineDescription, {
          tagline: asSentence(tagline),
          store: store.name,
          client: store.clientName,
        })
      : fmt(t.meta.homeDescription, { store: store.name, client: store.clientName }),
  );

  return {
    title: { default: title, template: `%s · ${store.name}` },
    description,
    openGraph: {
      type: "website",
      siteName: store.name,
      title,
      description,
      images: shareImages(store),
    },
  };
}

/**
 * Metadata for the gift portal root layout. The portal stays in English like
 * the rest of its buyer-and-approver workflow, and stays out of search indexes:
 * every catalogue is private to one company.
 */
export function giftPortalMetadata(catalogue: GiftCatalogue, store: Store): Metadata {
  const title = `${catalogue.name} — gift catalogue`;
  // Who runs the catalogue comes first: it is the part a share preview must
  // keep, and a long intro would otherwise push it past the clamp. A company
  // that runs its own programme is named once rather than twice in a row.
  const opening =
    catalogue.companyName === store.clientName
      ? `A private gift catalogue run by ${store.clientName} through ${store.name}.`
      : `A private gift catalogue for ${catalogue.companyName}, run by ${store.clientName} through ${store.name}.`;
  const description = clamp(
    catalogue.intro.trim() ? `${opening} ${asSentence(catalogue.intro)}` : opening,
  );

  return {
    title: { default: title, template: `%s · ${catalogue.name}` },
    description,
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      siteName: catalogue.name,
      title,
      description,
      images: shareImages(store),
    },
  };
}

/**
 * Browser-tab titles, page descriptions and share previews for the two
 * shopper-facing surfaces — a client storefront and a company's gift portal.
 *
 * Both are white-labelled: the shopper is on the client's shop, not on
 * Parcelith, so nothing here names the platform. The store or catalogue is the
 * title suffix, the description talks about that shop, and the share image is
 * the store's own: drawn in its colours on a storefront, its logo on a portal. The one place Parcelith is still named is the small
 * "powered by" line in the footer, which is a credit rather than branding.
 */
import type { Metadata } from "next";
import type { Locale } from "@/i18n/locales";
import type { ShopperTranslator } from "@/i18n/shopper-copy";
import { SITE_ORIGIN, storeLanguageUrls, storeUrl } from "./seo";
import { sectionsFromTree } from "./storefront-schema";
import type { SiteContent } from "./translations";
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

/**
 * The store's title and description in one language: what the store wrote in
 * the editor's Search and sharing panel, else the built-in wording.
 */
export function storeSeo(
  store: Store,
  t: ShopperTranslator<"meta">,
  tagline: string | null,
  site: Pick<SiteContent, "metaTitle" | "metaDescription">,
): { title: string; description: string } {
  const title = site.metaTitle.trim() || t("homeTitle", { store: store.name });
  const fallback = tagline
    ? t("taglineDescription", {
        tagline: asSentence(tagline),
        store: store.name,
        client: store.clientName,
      })
    : t("homeDescription", { store: store.name, client: store.clientName });
  return { title, description: clamp(site.metaDescription.trim() || fallback) };
}

/**
 * Metadata for the storefront root layout.
 *
 * `title.template` is what every page below inherits, so a basket reads
 * "Your basket · Northwind Supply Co". `title.default` covers the store home,
 * which sets no title of its own. The share image is the `opengraph-image`
 * route beside the layout, drawn in the store's colours.
 */
export function storefrontMetadata(
  store: Store,
  t: ShopperTranslator<"meta">,
  tagline: string | null,
  site: Pick<SiteContent, "metaTitle" | "metaDescription"> = { metaTitle: "", metaDescription: "" },
  locale: Locale = "en",
): Metadata {
  const seo = storeSeo(store, t, tagline, site);
  return {
    // The share images are served from the platform host, custom domain or not.
    metadataBase: new URL(SITE_ORIGIN),
    title: { default: seo.title, template: `%s · ${store.name}` },
    description: seo.description,
    openGraph: {
      type: "website",
      siteName: store.name,
      title: seo.title,
      description: seo.description,
      locale,
      url: storeUrl(store, locale),
    },
    twitter: { card: "summary_large_image", title: seo.title, description: seo.description },
  };
}

/**
 * A storefront page's canonical address, hreflang alternates and share
 * preview. `path` is the page below the store, e.g. `/products`. `title` is
 * the page's own title; the share preview adds the store name the way the tab
 * title does, unless `absolute` says the title is already complete.
 */
export function shopperPageMetadata(
  store: Store,
  locale: Locale,
  path: string,
  page: {
    title?: string;
    description?: string;
    absolute?: boolean;
    robots?: Metadata["robots"];
    /** The page's own share image route, below the store's language root. Defaults to the store's. */
    imagePath?: string;
  },
): Metadata {
  const languages = storeLanguageUrls(store, path);
  const shareTitle = page.title ? (page.absolute ? page.title : `${page.title} · ${store.name}`) : store.name;
  // Named outright: a page's own `openGraph` replaces the layout's, image and all.
  const image = {
    url: `/s/${store.slug}/${locale}${page.imagePath ?? ""}/opengraph-image`,
    width: 1200,
    height: 630,
    type: "image/png",
    alt: shareTitle,
  };
  return {
    ...(page.title ? { title: page.absolute ? { absolute: page.title } : page.title } : {}),
    ...(page.description ? { description: page.description } : {}),
    ...(page.robots ? { robots: page.robots } : {}),
    alternates: {
      canonical: storeUrl(store, locale, path),
      ...(Object.keys(languages).length > 0 ? { languages } : {}),
    },
    openGraph: {
      type: "website",
      siteName: store.name,
      title: shareTitle,
      ...(page.description ? { description: page.description } : {}),
      locale,
      url: storeUrl(store, locale, path),
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: shareTitle,
      ...(page.description ? { description: page.description } : {}),
      images: [image],
    },
  };
}

/** The share image for a gift portal: the store's logo, or nothing rather than a stand-in. */
function shareImages(store: Store) {
  return store.logoUrl ? [{ url: store.logoUrl, alt: store.name }] : undefined;
}

/**
 * Metadata for the gift portal root layout. The portal stays in English like
 * the rest of its buyer-and-approver workflow, and stays out of search indexes:
 * every catalogue is private to one company.
 */
export function giftPortalMetadata(catalogue: GiftCatalogue, store: Store): Metadata {
  const title = `${catalogue.name} | Gift catalogue`;
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

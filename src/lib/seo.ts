/**
 * Search and sharing for the public surfaces: absolute addresses, sitemaps,
 * robots files and structured data.
 *
 * A storefront has one canonical home. With a verified custom domain that is
 * the domain itself (`https://shop.northwind.example/products/field-tee`);
 * otherwise it is the platform address (`…/s/northwind-supply/products/…`).
 * Canonical links, hreflang alternates, sitemap entries and JSON-LD all read
 * the same function, so they cannot disagree.
 *
 * Kept free of server imports: the pages, the route handlers and
 * `npm run seo-check` all read it.
 */
import { DEFAULT_LOCALE, LOCALES, MARKETING_PATHS, localizedPath, type Locale } from "@/i18n/locales";
import { localeBase, storeLanguages } from "@/i18n/storefront-routing";
import { POLICY_KEYS } from "./policies";
import { currencyDecimals } from "./util";

/** The platform's own address. Relative metadata resolves against it. */
export const SITE_ORIGIN = "https://ai-powered-commerce-customization-produc-e55e.clawcorp.ai";

/** The longest search title and description kept. Search results cut well before either. */
export const SEO_LIMITS = { seoTitle: 120, seoDescription: 320 } as const;

/** Where crawlers are kept out of on the platform host. */
export const PRIVATE_PATHS = ["/app", "/admin", "/api/", "/login", "/invite/", "/g/"] as const;

type StoreAddress = {
  slug: string;
  defaultLanguage: string;
  languages?: string[];
  customDomain: string | null;
  domainStatus: "unset" | "pending" | "verified";
};

/**
 * The origin and path prefix a store's pages are canonical at. A domain that
 * has not been verified yet may not resolve, so it is never named as canonical.
 */
export function storeHome(store: StoreAddress): { origin: string; root: string } {
  if (store.customDomain && store.domainStatus === "verified") {
    return { origin: `https://${store.customDomain}`, root: "" };
  }
  return { origin: SITE_ORIGIN, root: `/s/${store.slug}` };
}

/** The absolute address of a storefront page in `locale`. `path` is below the store, e.g. `/products`. */
export function storeUrl(store: StoreAddress, locale: Locale, path = ""): string {
  const { origin, root } = storeHome(store);
  const { defaultLocale } = storeLanguages(store);
  const at = `${localeBase(root, locale, defaultLocale)}${path}`;
  return `${origin}${at || "/"}`;
}

/** The address of `path` in every enabled language, plus `x-default`. Empty with one language. */
export function storeLanguageUrls(store: StoreAddress, path = ""): Record<string, string> {
  const { locales, defaultLocale } = storeLanguages(store);
  if (locales.length < 2) return {};
  return {
    ...Object.fromEntries(locales.map((option) => [option, storeUrl(store, option, path)])),
    "x-default": storeUrl(store, defaultLocale, path),
  };
}

/** The absolute address of a marketing page. */
export function siteUrl(path: string, locale: Locale = DEFAULT_LOCALE): string {
  const at = localizedPath(path, locale);
  return at === "/" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${at}`;
}

/* ---------------------------------------------------------------- sitemaps */

export interface SitemapEntry {
  url: string;
  lastModified?: string;
  /** hreflang → absolute address, including the entry's own language. */
  languages?: Record<string, string>;
  images?: string[];
}

/** One entry per language for a page, each listing all of them as alternates. */
function perLanguage(
  locales: readonly Locale[],
  url: (locale: Locale) => string,
  languages: Record<string, string>,
  extra: Omit<SitemapEntry, "url" | "languages"> = {},
): SitemapEntry[] {
  return locales.map((locale) => ({
    url: url(locale),
    ...(Object.keys(languages).length > 0 ? { languages } : {}),
    ...extra,
  }));
}

/** Every page of the marketing site, in all nine languages. */
export function marketingSitemap(): SitemapEntry[] {
  return MARKETING_PATHS.flatMap((path) =>
    perLanguage(LOCALES, (locale) => siteUrl(path, locale), {
      ...Object.fromEntries(LOCALES.map((locale) => [locale, siteUrl(path, locale)])),
      "x-default": siteUrl(path, DEFAULT_LOCALE),
    }),
  );
}

type SitemapProduct = { slug: string; updatedAt: string; mockups: { url: string }[] };
type SitemapCollection = { handle: string; updatedAt: string; imageUrl: string | null };

/**
 * A storefront's pages in every enabled language: the home page, the shop,
 * each collection, each product on sale and the store's policies. An archived
 * store lists nothing.
 */
export function storeSitemap(
  store: StoreAddress & { status: "active" | "archived" },
  products: SitemapProduct[],
  collections: SitemapCollection[] = [],
): SitemapEntry[] {
  if (store.status === "archived") return [];
  const { locales } = storeLanguages(store);
  const page = (path: string, extra: Omit<SitemapEntry, "url" | "languages"> = {}) =>
    perLanguage(locales, (locale) => storeUrl(store, locale, path), storeLanguageUrls(store, path), extra);
  const latest = products.map((p) => p.updatedAt).sort().at(-1);

  return [
    ...page("", latest ? { lastModified: latest } : {}),
    ...page("/products", latest ? { lastModified: latest } : {}),
    ...collections.flatMap((collection) =>
      page(`/collections/${encodeURIComponent(collection.handle)}`, {
        lastModified: collection.updatedAt,
        ...(collection.imageUrl ? { images: [collection.imageUrl] } : {}),
      }),
    ),
    ...products.flatMap((product) =>
      page(`/products/${encodeURIComponent(product.slug)}`, {
        lastModified: product.updatedAt,
        images: product.mockups.slice(0, 4).map((m) => m.url),
      }),
    ),
    ...POLICY_KEYS.flatMap((key) => page(`/policies/${key}`)),
  ];
}

const XML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
const xml = (value: string) => value.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);

/** The sitemaps.org document, with hreflang alternates and image entries. */
export function sitemapXml(entries: SitemapEntry[]): string {
  const rows = entries.map((entry) => {
    const lines = [`<loc>${xml(entry.url)}</loc>`];
    for (const [hreflang, href] of Object.entries(entry.languages ?? {})) {
      lines.push(`<xhtml:link rel="alternate" hreflang="${xml(hreflang)}" href="${xml(href)}"/>`);
    }
    for (const image of entry.images ?? []) {
      lines.push(`<image:image><image:loc>${xml(image)}</image:loc></image:image>`);
    }
    if (entry.lastModified) lines.push(`<lastmod>${xml(entry.lastModified)}</lastmod>`);
    return `<url>\n${lines.map((line) => `  ${line}`).join("\n")}\n</url>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ...rows,
    "</urlset>",
    "",
  ].join("\n");
}

/** A store's robots file: its own pages are open, the basket and order pages are not. */
export function storeRobotsTxt(store: StoreAddress & { status: "active" | "archived" }): string {
  const { origin, root } = storeHome(store);
  if (store.status === "archived") return "User-agent: *\nDisallow: /\n";
  const { locales, defaultLocale } = storeLanguages(store);
  const closed = locales.flatMap((locale) =>
    ["/cart", "/checkout", "/orders"].map((path) => `${localeBase(root, locale, defaultLocale)}${path}`),
  );
  return [
    "User-agent: *",
    `Allow: ${root || "/"}`,
    ...closed.map((path) => `Disallow: ${path}`),
    "",
    `Sitemap: ${origin}${root}/sitemap.xml`,
    "",
  ].join("\n");
}

/* --------------------------------------------------------- structured data */

export type JsonLd = Record<string, unknown>;

const SCHEMA = "https://schema.org";

/** Minor units as the decimal string schema.org expects, e.g. 3200 USD → "32.00", 3200 JPY → "3200". */
export function decimalPrice(minor: number, currency: string): string {
  const digits = currencyDecimals(currency);
  return (minor / 10 ** digits).toFixed(digits);
}

const AVAILABILITY = {
  in_stock: `${SCHEMA}/InStock`,
  low_stock: `${SCHEMA}/LimitedAvailability`,
  out_of_stock: `${SCHEMA}/OutOfStock`,
} as const;

type Availability = keyof typeof AVAILABILITY;

/** The best availability across the variants a shopper can pick. */
function overallAvailability(variants: { availability: Availability }[]): string {
  if (variants.some((v) => v.availability === "in_stock")) return AVAILABILITY.in_stock;
  if (variants.some((v) => v.availability === "low_stock")) return AVAILABILITY.low_stock;
  return AVAILABILITY.out_of_stock;
}

/** A Product with its offers, for a storefront product page. */
export function productJsonLd(input: {
  name: string;
  description: string;
  url: string;
  sku: string;
  brand: string;
  images: string[];
  currency: string;
  variants: { price: number; availability: Availability }[];
}): JsonLd {
  const prices = input.variants.map((v) => v.price);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const availability = overallAvailability(input.variants);
  const offers =
    low === high
      ? {
          "@type": "Offer",
          url: input.url,
          price: decimalPrice(low, input.currency),
          priceCurrency: input.currency,
          availability,
          itemCondition: `${SCHEMA}/NewCondition`,
        }
      : {
          "@type": "AggregateOffer",
          url: input.url,
          lowPrice: decimalPrice(low, input.currency),
          highPrice: decimalPrice(high, input.currency),
          offerCount: input.variants.length,
          priceCurrency: input.currency,
          availability,
        };
  return {
    "@context": SCHEMA,
    "@type": "Product",
    name: input.name,
    description: input.description,
    sku: input.sku,
    url: input.url,
    image: input.images,
    brand: { "@type": "Brand", name: input.brand },
    offers,
  };
}

/** The store as an Organization, with its logo and support contact. */
export function organizationJsonLd(input: {
  name: string;
  url: string;
  logo: string | null;
  email: string | null;
  phone: string | null;
}): JsonLd {
  const contact =
    input.email || input.phone
      ? {
          contactPoint: {
            "@type": "ContactPoint",
            contactType: "customer support",
            ...(input.email ? { email: input.email } : {}),
            ...(input.phone ? { telephone: input.phone } : {}),
          },
        }
      : {};
  return {
    "@context": SCHEMA,
    "@type": "Organization",
    name: input.name,
    url: input.url,
    ...(input.logo ? { logo: input.logo } : {}),
    ...contact,
  };
}

/** A BreadcrumbList. The last item is the current page and may have no address. */
export function breadcrumbJsonLd(items: { name: string; url?: string }[]): JsonLd {
  return {
    "@context": SCHEMA,
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      ...(item.url ? { item: item.url } : {}),
    })),
  };
}

/** JSON for a `<script type="application/ld+json">`, safe to inline in HTML. */
export function jsonLdScript(data: JsonLd | JsonLd[]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

/** Descriptions are a preview, not an article: one paragraph, 160 characters at most. */
export function metaDescription(text: string, max = 160): string {
  const value = text.split("\n").find((line) => line.trim())?.trim().replace(/\s+/g, " ") ?? "";
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

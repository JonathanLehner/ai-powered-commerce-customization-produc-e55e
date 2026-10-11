import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DEFAULT_LOCALE, LOCALES, isLocale, localizedPath, type Locale } from "./locales";

/** A `[locale]` route parameter. Only the nine are prerendered, so anything else is English. */
export function asLocale(value: string): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** The canonical address and the hreflang alternates of a public page. */
export function alternatesFor(path: string, locale: Locale): Metadata["alternates"] {
  return {
    canonical: localizedPath(path, locale),
    languages: {
      ...Object.fromEntries(LOCALES.map((option) => [option, localizedPath(path, option)])),
      "x-default": localizedPath(path, DEFAULT_LOCALE),
    },
  };
}

/**
 * The share preview of a public page. The image is the `[locale]`
 * opengraph-image route; `title` is the full title as the tab shows it.
 */
export function shareFor(path: string, locale: Locale, title: string, description: string): Metadata {
  // Named outright: a page's own `openGraph` replaces the layout's, image and all.
  const image = { url: `/${locale}/opengraph-image`, width: 1200, height: 630, type: "image/png", alt: title };
  return {
    openGraph: {
      type: "website",
      siteName: "Parcelith",
      title,
      description,
      locale,
      url: localizedPath(path, locale),
      images: [image],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

/** Title, description, alternates and share preview for a public page, read from its namespace. */
export async function pageMetadata(
  locale: Locale,
  path: string,
  namespace: "howItWorks" | "pricing" | "contact" | "terms" | "privacy",
): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: alternatesFor(path, locale),
    ...shareFor(path, locale, `${t("metaTitle")} · Parcelith`, t("metaDescription")),
  };
}

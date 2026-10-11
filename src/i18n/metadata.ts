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

/** Title, description and alternates for a public page, read from its namespace. */
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
  };
}

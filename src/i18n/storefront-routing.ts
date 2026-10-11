import { DEFAULT_LOCALE, LOCALES, isLocale, type Locale } from "./locales";

/**
 * Languages on the shopper surfaces: a storefront at `/s/<slug>` and a gift
 * portal at `/g/<slug>`. Each store picks which of the nine languages it is
 * available in and which of those is its default. The default is served at the
 * surface's own address and every other enabled language under a prefix:
 * `/s/northwind-supply/products` and `/s/northwind-supply/de/products`.
 *
 * Kept free of server imports so the proxy and the language switcher can both
 * read it.
 */

/** Remembers the language a shopper last chose or visited. */
export const SHOPPER_LOCALE_COOKIE = "NEXT_LOCALE";

export interface StoreLanguages {
  /** The enabled languages, in the order the switcher lists them. */
  locales: Locale[];
  defaultLocale: Locale;
}

/**
 * The languages a store is available in. A store saved before languages could
 * be chosen has only its default; the default is always enabled.
 */
export function storeLanguages(store: { defaultLanguage: string; languages?: string[] }): StoreLanguages {
  const defaultLocale = isLocale(store.defaultLanguage) ? store.defaultLanguage : DEFAULT_LOCALE;
  const enabled = new Set<string>([...(store.languages ?? []), defaultLocale]);
  return { locales: LOCALES.filter((locale) => enabled.has(locale)), defaultLocale };
}

/** `/s/northwind-supply` in the default language, `/s/northwind-supply/de` in another. */
export function localeBase(root: string, locale: Locale, defaultLocale: Locale): string {
  return locale === defaultLocale ? root : `${root}/${locale}`;
}

/**
 * The same page in another language: `/s/x/de/products?tag=a` to
 * `/s/x/fr/products?tag=a`, or to `/s/x/products?tag=a` for the default.
 */
export function switchLocalePath(
  pathname: string,
  root: string,
  locale: Locale,
  defaultLocale: Locale,
): string {
  const after = pathname.startsWith(root) ? pathname.slice(root.length) : "";
  const segments = after.split("/").filter(Boolean);
  const rest = isLocale(segments[0]) ? segments.slice(1) : segments;
  return localeBase(root, locale, defaultLocale) + (rest.length > 0 ? `/${rest.join("/")}` : "");
}

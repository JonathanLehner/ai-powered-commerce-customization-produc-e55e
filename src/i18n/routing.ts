import { defineRouting } from "next-intl/routing";
import { DEFAULT_LOCALE, LOCALES } from "./locales";

/**
 * Routing for the public site. English is served at the root and every other
 * language under its prefix. The address alone decides the language, so the
 * pages can be prerendered: no redirect by browser language and no cookie.
 */
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "as-needed",
  localeDetection: false,
  localeCookie: false,
  // hreflang alternates are written into each page's metadata instead.
  alternateLinks: false,
});

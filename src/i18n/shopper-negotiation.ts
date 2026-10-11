import { match } from "@formatjs/intl-localematcher";
import Negotiator from "negotiator";
import { isLocale, type Locale } from "./locales";
import type { StoreLanguages } from "./storefront-routing";

/**
 * The language for a storefront or gift portal address that names none: the
 * shopper's cookie, then their browser's Accept-Language, each held to the
 * store's enabled languages, then the store default.
 */
export function negotiateShopperLocale(
  { cookie, acceptLanguage }: { cookie: string | undefined; acceptLanguage: string | null },
  { locales, defaultLocale }: StoreLanguages,
): Locale {
  if (isLocale(cookie) && locales.includes(cookie)) return cookie;
  if (locales.length === 1) return defaultLocale;
  const requested = new Negotiator({ headers: { "accept-language": acceptLanguage ?? "" } })
    .languages()
    .filter((tag) => tag !== "*");
  try {
    const matched = match(requested, locales, defaultLocale);
    return isLocale(matched) && locales.includes(matched) ? matched : defaultLocale;
  } catch {
    // A malformed tag in the header.
    return defaultLocale;
  }
}

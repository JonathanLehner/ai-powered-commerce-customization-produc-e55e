import "server-only";
import type { Metadata } from "next";
import { createTranslator } from "next-intl";
import { getFormatter, getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { headers } from "next/headers";
import type { EmailCopy } from "@/lib/email-templates";
import { applyShopText } from "@/lib/shop-text";
import type { Store } from "@/lib/types";
import { formatMinorUnits } from "./format";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./locales";
import { storeLanguageUrls, storeUrl } from "@/lib/seo";
import { STORE_ROOT_HEADER, localeBase, storeLanguages } from "./storefront-routing";

type StoreLanguageFields = Pick<Store, "defaultLanguage" | "languages" | "shopText">;

/** The `[locale]` route parameter, held to the languages the store has enabled. */
export function shopperLocale(store: StoreLanguageFields, requested: string): Locale {
  const { locales, defaultLocale } = storeLanguages(store);
  return isLocale(requested) && locales.includes(requested) ? requested : defaultLocale;
}

/**
 * The messages a shopper page is rendered with in `locale`: the built-in copy
 * with the store's own Shop text overrides merged over the `storefront` part.
 */
export async function shopperMessages(store: Pick<Store, "shopText">, locale: Locale) {
  const messages = await getMessages({ locale });
  const overrides = store.shopText?.[locale];
  if (!overrides) return messages;
  return { ...messages, storefront: applyShopText(messages.storefront, overrides) };
}

type StorefrontTranslator = Awaited<ReturnType<typeof getTranslations<"storefront">>>;

/** The `storefront` translator over `shopperMessages`, with the store's overrides in place. */
export async function shopperTranslator(store: Pick<Store, "shopText">, locale: Locale): Promise<StorefrontTranslator> {
  if (!store.shopText?.[locale]) return getTranslations({ locale, namespace: "storefront" });
  return createTranslator({
    locale,
    messages: await shopperMessages(store, locale),
    namespace: "storefront",
    timeZone: "UTC",
  }) as unknown as StorefrontTranslator;
}

/**
 * Where a store's pages are linked from on this request: `/s/<slug>` on the
 * platform, the bare domain root (`""`) when the shopper is on the store's own
 * domain.
 */
export async function publicStoreRoot(slug: string): Promise<string> {
  const list = await headers();
  return list.get(STORE_ROOT_HEADER) === slug ? "" : `/s/${slug}`;
}

/**
 * The shopper's language on a storefront or gift portal page: the translator
 * for the built-in copy, the formatter for money and dates, and the address of
 * the surface in that language (`root` is `/s/<slug>` or `/g/<slug>`; a
 * storefront on its own domain is linked from the domain root instead).
 */
export async function shopperIntl(store: StoreLanguageFields, requested: string, surfaceRoot: string) {
  const locale = shopperLocale(store, requested);
  const root = surfaceRoot.startsWith("/s/") ? await publicStoreRoot(surfaceRoot.slice(3)) : surfaceRoot;
  setRequestLocale(locale);
  const [t, format] = await Promise.all([shopperTranslator(store, locale), getFormatter({ locale })]);
  return {
    locale,
    t,
    format,
    money: (minor: number, currency: string) => formatMinorUnits(format, minor, currency),
    base: localeBase(root, locale, storeLanguages(store).defaultLocale),
    root,
  };
}

/**
 * The canonical address of a storefront page and its hreflang alternates, one
 * per enabled language. `path` is the page below the store, e.g. `/products`.
 * Both are absolute, on the store's verified custom domain when it has one.
 */
export function storefrontAlternates(
  store: StoreLanguageFields & Pick<Store, "slug" | "customDomain" | "domainStatus">,
  locale: Locale,
  path = "",
): Metadata["alternates"] {
  const languages = storeLanguageUrls(store, path);
  return {
    canonical: storeUrl(store, locale, path),
    languages: Object.keys(languages).length > 0 ? languages : undefined,
  };
}

/** The translator and formatter a transactional email is written with. */
export async function emailCopy(language: string | null | undefined): Promise<EmailCopy> {
  const locale = isLocale(language) ? language : DEFAULT_LOCALE;
  const [t, format] = await Promise.all([
    getTranslations({ locale, namespace: "storefront.email" }),
    getFormatter({ locale }),
  ]);
  return { locale, t, format };
}

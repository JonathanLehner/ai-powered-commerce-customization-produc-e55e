"use server";

import { getFormatter } from "next-intl/server";
import { formatMinorUnits } from "@/i18n/format";
import { publicStoreRoot, shopperLocale } from "@/i18n/storefront";
import { localeBase, storeLanguages } from "@/i18n/storefront-routing";
import { getStore } from "@/lib/data";
import { searchShop } from "@/lib/operations/shop";
import { cleanQuery, SEARCH_LIMITS, type SearchKind } from "@/lib/search";
import { readCurrency } from "./shop";

export interface InstantResult {
  kind: SearchKind;
  id: string;
  title: string;
  href: string;
  imageUrl: string | null;
  price: string | null;
}

/**
 * The header's instant results: the best few matches for what the shopper has
 * typed so far, in their language and display currency. Reads only.
 */
export async function instantSearch(storeId: string, language: string, query: string): Promise<InstantResult[]> {
  const q = cleanQuery(query);
  if (q.length < 2) return [];
  const store = await getStore(storeId);
  if (!store || store.status !== "active") return [];
  const locale = shopperLocale(store, language);
  const base = localeBase(await publicStoreRoot(store.slug), locale, storeLanguages(store).defaultLocale);
  const [currency, format] = await Promise.all([readCurrency(store.defaultCurrency, store.currencies), getFormatter({ locale })]);
  const results = await searchShop(store, locale, q, currency, SEARCH_LIMITS.instant);
  return results.map((doc) => ({
    kind: doc.kind,
    id: doc.id,
    title: doc.title,
    href: `${base}${doc.path}`,
    imageUrl: doc.imageUrl,
    price: doc.displayPrice !== null ? formatMinorUnits(format, doc.displayPrice, currency) : null,
  }));
}

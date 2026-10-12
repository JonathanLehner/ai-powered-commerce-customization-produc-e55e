"use server";

import { getFormatter } from "next-intl/server";
import { formatMinorUnits } from "@/i18n/format";
import { shopperLocale } from "@/i18n/storefront";
import { localeBase, storeLanguages } from "@/i18n/storefront-routing";
import { getStore } from "@/lib/data";
import { convert } from "@/lib/pricing";
import { cleanQuery, SEARCH_LIMITS, searchStore, type SearchKind } from "@/lib/search";
import { storeSearchDocuments } from "@/lib/search-data";
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
  const base = localeBase(`/s/${store.slug}`, locale, storeLanguages(store).defaultLocale);
  const [documents, currency, format] = await Promise.all([
    storeSearchDocuments(store, locale),
    readCurrency(store.defaultCurrency, store.currencies),
    getFormatter({ locale }),
  ]);
  return searchStore(documents, q, SEARCH_LIMITS.instant).map((doc) => ({
    kind: doc.kind,
    id: doc.id,
    title: doc.title,
    href: `${base}${doc.path}`,
    imageUrl: doc.imageUrl,
    price:
      doc.price !== null && doc.currency
        ? formatMinorUnits(format, convert(doc.price, doc.currency, currency), currency)
        : null,
  }));
}

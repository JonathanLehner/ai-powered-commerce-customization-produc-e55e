import "server-only";
import { storeLanguages } from "@/i18n/storefront-routing";
import { listPublishedContent } from "./content-data";
import { listProductCollections, listPublishedProducts } from "./data";
import { searchDocuments, type SearchDocument } from "./search";
import type { Store } from "./types";

/** Everything a shopper can search in the store, in `locale`, from three reads made together. */
export async function storeSearchDocuments(store: Store, locale: string): Promise<SearchDocument[]> {
  if (store.status !== "active") return [];
  const [products, collections, entries] = await Promise.all([
    listPublishedProducts(store.id),
    listProductCollections(store.id),
    listPublishedContent(store.id),
  ]);
  return searchDocuments({ products, collections, entries }, locale, storeLanguages(store).defaultLocale);
}

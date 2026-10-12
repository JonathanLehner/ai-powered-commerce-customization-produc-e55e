/**
 * Storefront search over products, collections, pages and blog posts, in the
 * shopper's language, with Fuse.js's fuzzy matching so a typo ("hodie",
 * "tshirt") still finds what was meant.
 *
 * Shared by the search page, the header's instant results and `npm run
 * search-check`. Kept free of server imports: the caller reads the records.
 */
import Fuse, { type Expression, type IFuseOptions } from "fuse.js";
import { collectionProducts, localizeCollection } from "./collections";
import { contentPath, entrySummary, localizeEntry } from "./content";
import { localizeProduct } from "./translations";
import type { ContentEntry, ProductCollection, StoreProduct } from "./types";

export const SEARCH_KINDS = ["product", "collection", "page", "post"] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

export const SEARCH_LIMITS = { query: 80, instant: 8, page: 48 } as const;

export interface SearchDocument {
  kind: SearchKind;
  id: string;
  title: string;
  /** Description, excerpt or body text, for matching and the result line. */
  text: string;
  tags: string[];
  /** Below the store's address, such as `/products/field-tee`. */
  path: string;
  imageUrl: string | null;
  /** Lowest price in the product's own currency, for products. */
  price: number | null;
  currency: string | null;
}

export interface SearchRecords {
  products: StoreProduct[];
  collections: ProductCollection[];
  entries: ContentEntry[];
}

/** Everything a shopper can find, in `locale`. Only what is on show is passed in. */
export function searchDocuments(records: SearchRecords, locale: string, defaultLocale: string): SearchDocument[] {
  const products = records.products.map((stored): SearchDocument => {
    const product = localizeProduct(stored, locale, defaultLocale);
    const prices = product.variants.filter((v) => v.enabled).map((v) => v.price);
    return {
      kind: "product",
      id: product.id,
      title: product.name,
      text: product.description.slice(0, 400),
      tags: product.tags,
      path: `/products/${encodeURIComponent(product.slug)}`,
      imageUrl: product.mockups[0]?.url ?? null,
      price: prices.length > 0 ? Math.min(...prices) : product.price,
      currency: product.currency,
    };
  });
  const collections = records.collections
    // An empty collection would lead to an empty page.
    .filter((c) => collectionProducts(c.productIds, records.products).length > 0)
    .map((stored): SearchDocument => {
      const collection = localizeCollection(stored, locale, defaultLocale);
      return {
        kind: "collection",
        id: collection.id,
        title: collection.name,
        text: collection.description.slice(0, 400),
        tags: [],
        path: `/collections/${encodeURIComponent(collection.handle)}`,
        imageUrl: collection.imageUrl,
        price: null,
        currency: null,
      };
    });
  const entries = records.entries
    .filter((entry) => entry.status === "published")
    .map((stored): SearchDocument => {
      const entry = localizeEntry(stored, locale, defaultLocale);
      return {
        kind: entry.kind,
        id: entry.id,
        title: entry.title,
        text: entrySummary(entry, 400),
        tags: [],
        path: contentPath(entry.kind, entry.handle),
        imageUrl: entry.coverImageUrl,
        price: null,
        currency: null,
      };
    });
  return [...products, ...collections, ...entries];
}

const OPTIONS: IFuseOptions<SearchDocument> = {
  keys: [
    { name: "title", weight: 0.65 },
    { name: "tags", weight: 0.2 },
    { name: "text", weight: 0.15 },
  ],
  // Loose enough for a slip of one or two letters, tight enough that unrelated
  // words do not match.
  threshold: 0.38,
  ignoreLocation: true,
  minMatchCharLength: 2,
  includeScore: true,
};

/** Trims and shortens what was typed; empty when there is nothing worth searching. */
export function cleanQuery(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SEARCH_LIMITS.query);
}

/**
 * The documents matching `query`, best first. Each word has to match on its
 * own, so "blue hoodie" finds blue hoodies rather than everything blue.
 */
export function searchStore(documents: SearchDocument[], query: string, limit: number = SEARCH_LIMITS.page): SearchDocument[] {
  const q = cleanQuery(query);
  if (q.length < 2) return [];
  const fuse = new Fuse(documents, OPTIONS);
  const words = q.split(" ").filter((word) => word.length >= 2);
  const results =
    words.length > 1
      ? fuse.search({
          $and: words.map((word): Expression => ({ $or: ["title", "tags", "text"].map((key): Expression => ({ [key]: word })) })),
        })
      : fuse.search(q);
  return results.slice(0, limit).map((result) => result.item);
}

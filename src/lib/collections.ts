/**
 * Collections: hand-picked groups of a store's products.
 *
 * The rules shared by the workspace, the storefront and `npm run
 * collections-check`: what a handle may look like, which products a shopper
 * sees and in what order, how a collection page sorts, and how a collection's
 * name and description are translated. Kept free of server imports.
 */
import { localized, type FieldTranslations } from "./translations";
import { slugify } from "./util";

export const COLLECTION_LIMITS = { name: 80, description: 600, handle: 60 } as const;

/** A handle is lower-case letters, digits and single hyphens: `new-hires`. */
export function normalizeHandle(raw: string): string {
  return slugify(raw).slice(0, COLLECTION_LIMITS.handle);
}

export function isValidHandle(handle: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(handle) && handle.length <= COLLECTION_LIMITS.handle;
}

/**
 * A handle no other collection in the store uses: `apparel`, then `apparel-2`.
 * `taken` holds the store's other handles.
 */
export function uniqueHandle(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const root = normalizeHandle(base) || "collection";
  if (!used.has(root)) return root;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = `${root.slice(0, COLLECTION_LIMITS.handle - suffix.length)}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}

/**
 * The ids in `ids`, each once, keeping only those `allowed` holds. Used on
 * every list the browser sends back, so a stale tab or a forged request can
 * neither duplicate a product nor slip in one from another store.
 */
export function cleanIdList(ids: unknown, allowed: Iterable<string>): string[] {
  if (!Array.isArray(ids)) return [];
  const permitted = new Set(allowed);
  const out: string[] = [];
  for (const id of ids) {
    if (typeof id === "string" && permitted.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * The order a drag produced, applied to the list as it is now. Ids the
 * browser did not know about (added in another tab) keep their place after
 * the reordered ones, and ids no longer in the list are dropped.
 */
export function applyOrder(current: string[], requested: string[]): string[] {
  const present = new Set(current);
  const ordered = requested.filter((id, i) => present.has(id) && requested.indexOf(id) === i);
  const rest = current.filter((id) => !ordered.includes(id));
  return [...ordered, ...rest];
}

/** The products of a collection in its own order, skipping any not in `products`. */
export function collectionProducts<P extends { id: string }>(productIds: string[], products: P[]): P[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  return productIds.flatMap((id) => {
    const product = byId.get(id);
    return product ? [product] : [];
  });
}

/* ------------------------------------------------------------------ sorting */

export const COLLECTION_SORTS = ["featured", "price-asc", "price-desc", "newest"] as const;
export type CollectionSort = (typeof COLLECTION_SORTS)[number];

export function parseSort(raw: unknown): CollectionSort {
  return COLLECTION_SORTS.includes(raw as CollectionSort) ? (raw as CollectionSort) : "featured";
}

/**
 * Sorts a collection's products. Featured is the order the team set; the
 * others are stable, so equal prices keep that order too. `price` is the
 * amount in the shopper's currency, so mixed source currencies compare fairly.
 */
export function sortProducts<P extends { price: number; publishedAt: string | null; importedAt: string }>(
  products: P[],
  sort: CollectionSort,
): P[] {
  if (sort === "featured") return products;
  const indexed = products.map((product, index) => ({ product, index }));
  const newest = (p: P) => p.publishedAt ?? p.importedAt;
  indexed.sort((a, b) => {
    let diff = 0;
    if (sort === "price-asc") diff = a.product.price - b.product.price;
    else if (sort === "price-desc") diff = b.product.price - a.product.price;
    else diff = newest(b.product).localeCompare(newest(a.product));
    return diff !== 0 ? diff : a.index - b.index;
  });
  return indexed.map(({ product }) => product);
}

/* ------------------------------------------------------------- translations */

interface TranslatableCollection {
  name: string;
  description: string;
  translations?: FieldTranslations;
}

/** The fields of a collection a shopper reads, with their source text. */
export function collectionFields(collection: TranslatableCollection): { key: string; source: string; long?: boolean }[] {
  return [
    { key: "name", source: collection.name },
    { key: "description", source: collection.description, long: true },
  ];
}

/** The collection as a shopper reads it in `locale`, falling back to the source. */
export function localizeCollection<C extends TranslatableCollection>(collection: C, locale: string, defaultLocale: string): C {
  if (locale === defaultLocale) return collection;
  const tr = collection.translations;
  return {
    ...collection,
    name: localized(collection.name, tr, locale, defaultLocale, "name"),
    description: localized(collection.description, tr, locale, defaultLocale, "description"),
  };
}

/* --------------------------------------------------------------- navigation */

/** The root-node prop the storefront header's collection links are kept under. */
export const NAV_COLLECTIONS_PROP = "navCollections";

/** The collection ids a page tree's header links to, in header order. */
export function navCollectionIds(tree: unknown): string[] {
  if (!tree || typeof tree !== "object") return [];
  const root = (tree as Record<string, { props?: Record<string, unknown> }>).ROOT;
  const value = root?.props?.[NAV_COLLECTIONS_PROP];
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}

/** The Product grid section's "all products" source. */
export const ALL_PRODUCTS_SOURCE = "all";

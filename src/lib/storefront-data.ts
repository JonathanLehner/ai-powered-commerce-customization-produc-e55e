import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { COLLECTIONS, listPublishedProducts } from "./data";
import { db } from "./mongo";
import { POLICY_KEYS, storePolicyText, type PolicyKey } from "./policies";
import type {
  Cart,
  CatalogProduct,
  DiscountCode,
  ProductCollection,
  Store,
  Storefront,
  StoreProduct,
  TaxBracket,
} from "./types";

/**
 * The reads a storefront page is built from, shaped so a page costs one or two
 * database round trips.
 *
 * The page, its layout and both `generateMetadata`s all want the store, and the
 * layout wants the storefront, the collections and the shopper's basket too.
 * Read one by one they were seven or more queries queued on the request's single
 * connection. Here they are one aggregate, memoised for the render with React's
 * `cache`. On Workers the proxy, which has already looked the store up to decide
 * the status, hands its result to the render through the request context, so
 * the page does not ask again.
 */

/** The shopper's basket with everything it is priced from, read with the store. */
export interface Basket {
  cart: Cart;
  discountCode: DiscountCode | null;
  products: Map<string, StoreProduct>;
  /** Tax rate by bracket id. */
  rates: Map<string, number>;
}

export interface StorefrontData {
  /** Without `policies`: they are read per language through `storePolicies`. */
  store: Store;
  storefront: Storefront | null;
  /** In the order the team arranged them. */
  collections: ProductCollection[];
  basket: Basket | null;
}

export interface StorefrontProduct {
  product: StoreProduct;
  catalog: CatalogProduct | null;
}

/** The anonymous shopper's id, which their basket is filed under. */
export const SHOPPER_COOKIE = "cc_shopper";

const WITHOUT_ID = { $project: { _id: 0 } };

type BasketRow = Cart & { products: StoreProduct[]; taxBrackets: TaxBracket[]; discount: DiscountCode[] };
type StoreRow = Store & { storefront: Storefront[]; collections: ProductCollection[]; cart?: BasketRow[] };

/** One aggregate: the store, its storefront and collections, and the shopper's basket. */
async function readStorefront(match: Record<string, unknown>, session: string | null): Promise<StoreRow[]> {
  return db.aggregate<StoreRow>(COLLECTIONS.stores, [
    { $match: match },
    { $limit: 10 },
    { $project: { _id: 0, policies: 0 } },
    {
      $lookup: {
        from: COLLECTIONS.storefronts,
        localField: "id",
        foreignField: "storeId",
        pipeline: [{ $limit: 1 }, WITHOUT_ID],
        as: "storefront",
      },
    },
    {
      $lookup: {
        from: COLLECTIONS.productCollections,
        localField: "id",
        foreignField: "storeId",
        pipeline: [{ $sort: { position: 1, createdAt: 1 } }, WITHOUT_ID],
        as: "collections",
      },
    },
    ...(session
      ? [
          {
            $lookup: {
              from: COLLECTIONS.carts,
              localField: "id",
              foreignField: "storeId",
              pipeline: [
                { $match: { sessionId: session } },
                { $limit: 1 },
                WITHOUT_ID,
                {
                  $lookup: {
                    from: COLLECTIONS.storeProducts,
                    localField: "items.storeProductId",
                    foreignField: "id",
                    pipeline: [WITHOUT_ID],
                    as: "products",
                  },
                },
                {
                  $lookup: {
                    from: COLLECTIONS.taxBrackets,
                    localField: "products.taxBracketId",
                    foreignField: "id",
                    pipeline: [WITHOUT_ID],
                    as: "taxBrackets",
                  },
                },
                {
                  $lookup: {
                    from: COLLECTIONS.discounts,
                    localField: "discountCode",
                    foreignField: "code",
                    let: { storeId: "$storeId" },
                    pipeline: [{ $match: { $expr: { $eq: ["$storeId", "$$storeId"] } } }, { $limit: 1 }, WITHOUT_ID],
                    as: "discount",
                  },
                },
              ],
              as: "cart",
            },
          },
        ]
      : []),
  ]);
}

function toStorefrontData(row: StoreRow): StorefrontData {
  const { storefront, collections, cart, ...store } = row;
  const found = cart?.[0];
  let basket: Basket | null = null;
  if (found) {
    const { products, taxBrackets, discount, ...plain } = found;
    basket = {
      cart: plain,
      // A code is only looked up when the basket holds one.
      discountCode: plain.discountCode ? (discount[0] ?? null) : null,
      products: new Map(products.map((p) => [p.id, p])),
      rates: new Map(taxBrackets.map((b) => [b.id, b.rate])),
    };
  }
  return { store: store as Store, storefront: storefront[0] ?? null, collections, basket };
}

async function loadBySlug(slug: string, session: string | null): Promise<StorefrontData | null> {
  const [row] = await readStorefront({ slug }, session);
  return row ? toStorefrontData(row) : null;
}

/**
 * A custom domain typed into more than one store goes to the verified, active
 * one first, as `getStoreByDomain` decides.
 */
async function loadByDomain(domain: string, session: string | null): Promise<StorefrontData | null> {
  const rows = await readStorefront({ customDomain: domain }, session);
  const rank = (store: Store) => (store.domainStatus === "verified" ? 0 : 2) + (store.status === "active" ? 0 : 1);
  const row = rows.sort((a, b) => rank(a) - rank(b))[0];
  return row ? toStorefrontData(row) : null;
}

async function loadProduct(storeId: string, slug: string): Promise<StorefrontProduct | null> {
  const [row] = await db.aggregate<StoreProduct & { catalog: CatalogProduct[] }>(COLLECTIONS.storeProducts, [
    { $match: { storeId, slug } },
    { $limit: 1 },
    WITHOUT_ID,
    {
      $lookup: {
        from: COLLECTIONS.catalog,
        localField: "catalogProductId",
        foreignField: "id",
        pipeline: [{ $limit: 1 }, WITHOUT_ID],
        as: "catalog",
      },
    },
  ]);
  if (!row) return null;
  const { catalog, ...product } = row;
  return { product, catalog: catalog[0] ?? null };
}

/* ------------------------------------------------- shared with the proxy */

const CONTEXT = Symbol.for("__cloudflare-context__");
/**
 * On `globalThis` rather than in this module: OpenNext bundles the proxy and the
 * pages separately, and each bundle has its own copy of this file.
 */
const HANDED_OVER = Symbol.for("parcelith.storefront-handover");
const handedOver = ((globalThis as Record<symbol, unknown>)[HANDED_OVER] ??= new WeakMap()) as WeakMap<
  object,
  Map<string, Promise<unknown>>
>;

function requestShelf(): Map<string, Promise<unknown>> | null {
  const context = (globalThis as Record<symbol, object | undefined>)[CONTEXT];
  if (!context) return null;
  let shelf = handedOver.get(context);
  if (!shelf) handedOver.set(context, (shelf = new Map()));
  return shelf;
}

/** What the proxy read for this request, if it read it. */
function takeOver<T>(key: string, load: () => Promise<T>): Promise<T> {
  const ready = requestShelf()?.get(key) as Promise<T> | undefined;
  // A read the proxy could not finish is simply done again.
  return ready ? ready.catch(load) : load();
}

/** Keeps a proxy read for the render of the same request. Reads only: a post can change what was read. */
function handOver<T>(key: string, pending: Promise<T>): Promise<T> {
  requestShelf()?.set(key, pending);
  return pending;
}

const storeKey = (slug: string, session: string | null) => `store\n${slug}\n${session ?? ""}`;
const productKey = (storeId: string, slug: string) => `product\n${storeId}\n${slug}`;

/** The proxy's store lookup for a GET or HEAD on `/s/<slug>`. */
export function proxyStorefrontBySlug(slug: string, session: string | null): Promise<StorefrontData | null> {
  return handOver(storeKey(slug, session), loadBySlug(slug, session));
}

/** The proxy's store lookup for a GET or HEAD on a store's custom domain. */
export async function proxyStorefrontByDomain(domain: string, session: string | null): Promise<StorefrontData | null> {
  const data = await loadByDomain(domain, session);
  if (data) handOver(storeKey(data.store.slug, session), Promise.resolve(data));
  return data;
}

/** The proxy's product lookup for a GET or HEAD on a product page. */
export function proxyStorefrontProduct(storeId: string, slug: string): Promise<StorefrontProduct | null> {
  return handOver(productKey(storeId, slug), loadProduct(storeId, slug));
}

/* ------------------------------------------------------- for the render */

const storefrontFor = cache((slug: string, session: string | null) =>
  takeOver(storeKey(slug, session), () => loadBySlug(slug, session)),
);

/** The store at `/s/<slug>` with its storefront, collections and the shopper's basket. */
export async function storefrontBySlug(slug: string): Promise<StorefrontData | null> {
  const session = (await cookies()).get(SHOPPER_COOKIE)?.value ?? null;
  return storefrontFor(slug, session);
}

/** A product page's product and the catalogue record it is made from. */
export const storefrontProduct = cache((storeId: string, slug: string) =>
  takeOver(productKey(storeId, slug), () => loadProduct(storeId, slug)),
);

/** What the store has on sale, read once per render. */
export const publishedProducts = cache((storeId: string) => listPublishedProducts(storeId));

/* -------------------------------------------------------------- policies */

/**
 * The policy text a store wrote, per store and language, kept in memory.
 *
 * Policies change rarely, so the storefront no longer carries every language's
 * text on every page. The key includes `policiesVersion`, which comes with the
 * store and changes on every save, so a save in any instance is seen by every
 * other one on its next read. `forgetStorePolicies` drops this instance's copy.
 */
const policyCache = new Map<string, Partial<Record<PolicyKey, string>>>();
const POLICY_CACHE_LIMIT = 500;

export async function storePolicies(
  store: Pick<Store, "id" | "policiesVersion">,
  locale: string,
  defaultLocale: string,
): Promise<Partial<Record<PolicyKey, string>>> {
  const key = `${store.id}\n${store.policiesVersion ?? ""}\n${locale}`;
  const cached = policyCache.get(key);
  if (cached) return cached;
  const [row] = await db.aggregate<Pick<Store, "policies">>(COLLECTIONS.stores, [
    { $match: { id: store.id } },
    { $limit: 1 },
    { $project: { _id: 0, [`policies.${locale}`]: 1, [`policies.${defaultLocale}`]: 1 } },
  ]);
  const own: Partial<Record<PolicyKey, string>> = {};
  for (const policy of POLICY_KEYS) {
    const text = storePolicyText(row ?? {}, policy, locale, defaultLocale);
    if (text) own[policy] = text;
  }
  if (policyCache.size >= POLICY_CACHE_LIMIT) policyCache.delete(policyCache.keys().next().value!);
  policyCache.set(key, own);
  return own;
}

/** Drops this instance's cached policies for a store, after they are saved. */
export function forgetStorePolicies(storeId: string): void {
  for (const key of policyCache.keys()) {
    if (key.startsWith(`${storeId}\n`)) policyCache.delete(key);
  }
}

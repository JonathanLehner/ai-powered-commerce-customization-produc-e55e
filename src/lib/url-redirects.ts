import "server-only";
import { COLLECTIONS } from "./data";
import { db } from "./mongo";
import { redirectRoute } from "./shopify";
import type { UrlRedirect } from "./types";

/**
 * Permanent redirects from a store's old Shopify addresses. The import writes
 * one for every product whose handle had to change; merchants add their own
 * for collections and pages. The proxy only asks once an address has turned
 * out to match no page, so a working page never costs a lookup.
 */

export function listRedirects(storeId: string): Promise<UrlRedirect[]> {
  return db.find<UrlRedirect>(COLLECTIONS.urlRedirects, { storeId }, { sort: { path: 1 } });
}

/**
 * Where a missing storefront address on a store's own domain should go, or
 * null. `rest` is the path below the store, language prefix removed.
 */
export async function shopifyRedirect(storeId: string, rest: string[]): Promise<string | null> {
  const route = redirectRoute(rest);
  if (!route) return null;
  if (route.lookup) {
    const found = await db.findOne<UrlRedirect>(COLLECTIONS.urlRedirects, { storeId, path: route.lookup });
    if (found) return found.target;
  }
  return route.fallback;
}

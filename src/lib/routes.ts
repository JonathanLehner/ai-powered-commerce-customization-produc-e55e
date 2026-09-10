/**
 * The app's route table, written out as patterns.
 *
 * Everything inside the app asks the router which page an address belongs to.
 * `src/proxy.ts` runs *before* the router and cannot: it has to know whether an
 * address matches a real page in order to give a mistyped one a 404 status,
 * because a status can only be set before the response starts streaming.
 *
 * The list therefore mirrors `src/app`, minus the catch-alls — an address that
 * matches nothing here is exactly an address a `[...rest]` page or the
 * site-wide not-found page would answer. `npm run fallback-check` rebuilds the
 * list from the route files and fails if the two have drifted, so adding a page
 * without adding it here is caught rather than silently served as a 404.
 */
export const ROUTES = [
  "/",
  "/contact",
  "/how-it-works",
  "/legal/privacy",
  "/legal/terms",
  "/login",
  "/pricing",
  "/invite/[token]",
  "/api/asset",
  "/api/uploads",

  "/admin",
  "/admin/agencies",
  "/admin/audit",
  "/admin/audit/export",
  "/admin/catalog",
  "/admin/catalog/new",
  "/admin/catalog/[itemId]",
  "/admin/quotes",
  "/admin/suppliers",
  "/admin/tax",

  "/app",
  "/app/stores/new",
  "/app/stores/[storeId]",
  "/app/stores/[storeId]/activity",
  "/app/stores/[storeId]/activity/export",
  "/app/stores/[storeId]/assistant",
  "/app/stores/[storeId]/catalog",
  "/app/stores/[storeId]/catalog/[productId]",
  "/app/stores/[storeId]/gifting",
  "/app/stores/[storeId]/gifting/[catalogueId]",
  "/app/stores/[storeId]/orders",
  "/app/stores/[storeId]/orders/campaigns/[campaignId]",
  "/app/stores/[storeId]/orders/[orderId]",
  "/app/stores/[storeId]/setup",
  "/app/stores/[storeId]/sourcing",
  "/app/stores/[storeId]/storefront",
  "/app/stores/[storeId]/team",

  "/g/[slug]",
  "/g/[slug]/c/[code]",
  "/g/[slug]/enter",
  "/g/[slug]/order",

  "/s/[slug]",
  "/s/[slug]/cart",
  "/s/[slug]/checkout",
  "/s/[slug]/orders",
  "/s/[slug]/orders/[code]",
  "/s/[slug]/products",
  "/s/[slug]/products/[productSlug]",
] as const;

/** The segments of a pathname, with the empty strings around the slashes dropped. */
export function segmentsOf(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

/** True when the address is served by a real page or route handler. */
export function matchesRoute(pathname: string): boolean {
  const segments = segmentsOf(pathname);
  return ROUTES.some((route) => {
    const pattern = segmentsOf(route);
    if (pattern.length !== segments.length) return false;
    // A dynamic segment stands for any one non-empty segment; a static one has
    // to match exactly. Static routes are listed alongside the dynamic ones
    // they shadow, so either matching is a real page.
    return pattern.every((part, i) => (part.startsWith("[") ? true : part === segments[i]));
  });
}

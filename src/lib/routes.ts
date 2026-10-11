import { isLocale } from "@/i18n/locales";

/**
 * The app's route table, written out as patterns.
 *
 * Everything inside the app asks the router which page an address belongs to.
 * `src/middleware.ts` runs *before* the router and cannot: it has to know whether an
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
  // The public site, the storefronts and the gift portals. The default language
  // is served without a prefix and every other one under it, so `[locale]`
  // matches a supported language or nothing at all.
  "/[locale]",
  "/[locale]/contact",
  "/[locale]/how-it-works",
  "/[locale]/legal/privacy",
  "/[locale]/legal/terms",
  "/[locale]/pricing",
  "/[locale]/signup",
  "/login",
  "/invite/[token]",
  "/api/asset",
  "/api/uploads",

  "/admin",
  "/admin/agencies",
  "/admin/audit",
  "/admin/audit/export",
  "/admin/catalog",
  "/admin/catalog/new",
  "/admin/enquiries/[enquiryId]",
  "/admin/catalog/[itemId]",
  "/admin/quotes",
  "/admin/suppliers",
  "/admin/tax",

  "/app",
  "/app/attention",
  "/app/billing",
  "/app/billing/complete",
  "/app/people",
  "/app/stores/new",
  "/app/stores/[storeId]",
  "/app/stores/[storeId]/activity",
  "/app/stores/[storeId]/activity/export",
  "/app/stores/[storeId]/analytics",
  "/app/stores/[storeId]/analytics/export",
  "/app/stores/[storeId]/assistant",
  "/app/stores/[storeId]/catalog",
  "/app/stores/[storeId]/catalog/[productId]",
  "/app/stores/[storeId]/catalog/collections",
  "/app/stores/[storeId]/catalog/collections/[collectionId]",
  "/app/stores/[storeId]/customers",
  "/app/stores/[storeId]/customers/export",
  "/app/stores/[storeId]/customers/[customerId]",
  "/app/stores/[storeId]/customers/[customerId]/export",
  "/app/stores/[storeId]/discounts",
  "/app/stores/[storeId]/gifting",
  "/app/stores/[storeId]/gifting/[catalogueId]",
  "/app/stores/[storeId]/orders",
  "/app/stores/[storeId]/orders/campaigns/[campaignId]",
  "/app/stores/[storeId]/orders/export",
  "/app/stores/[storeId]/orders/[orderId]",
  "/app/stores/[storeId]/setup",
  "/app/stores/[storeId]/sourcing",
  "/app/stores/[storeId]/storefront",
  "/app/stores/[storeId]/team",

  "/g/[slug]/[locale]",
  "/g/[slug]/[locale]/c/[code]",
  "/g/[slug]/[locale]/enter",
  "/g/[slug]/[locale]/order",
  "/g/[slug]/[locale]/policies/[policy]",

  "/s/[slug]/robots.txt",
  "/s/[slug]/sitemap.xml",
  "/s/[slug]/[locale]",
  "/s/[slug]/[locale]/cart",
  "/s/[slug]/[locale]/checkout",
  "/s/[slug]/[locale]/collections/[handle]",
  "/s/[slug]/[locale]/orders",
  "/s/[slug]/[locale]/orders/[code]",
  "/s/[slug]/[locale]/policies/[policy]",
  "/s/[slug]/[locale]/products",
  "/s/[slug]/[locale]/products/[productSlug]",
] as const;

const LOCALE_SEGMENT = "[locale]";

/** The segments of a pathname, with the empty strings around the slashes dropped. */
export function segmentsOf(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

/** True when the address is served by a real page or route handler. */
export function matchesRoute(pathname: string): boolean {
  const segments = segmentsOf(pathname);
  return ROUTES.some((route) => {
    const pattern = segmentsOf(route);
    // A localised page answers with or without its language prefix.
    const prefix = pattern.indexOf(LOCALE_SEGMENT);
    if (prefix === -1) return fits(pattern, segments);
    return fits(pattern, segments) || fits(pattern.toSpliced(prefix, 1), segments);
  });
}

function fits(pattern: string[], segments: string[]): boolean {
  if (pattern.length !== segments.length) return false;
  // A dynamic segment stands for any one non-empty segment; a static one has
  // to match exactly. Static routes are listed alongside the dynamic ones
  // they shadow, so either matching is a real page.
  return pattern.every((part, i) => {
    if (part === LOCALE_SEGMENT) return isLocale(segments[i]);
    return part.startsWith("[") ? true : part === segments[i];
  });
}

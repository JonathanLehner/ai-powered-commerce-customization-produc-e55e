import type { Metadata } from "next";
import { notFoundRobots, StorefrontNotFoundView, UnknownStoreView } from "@/components/NotFoundViews";
import { getStoreBySlug } from "@/lib/data";

/**
 * Any address under a storefront that matches no page — an old campaign link, a
 * typo — is a not-found page in that store rather than a bare framework page.
 * The real routes are more specific, so they always win over this catch-all.
 *
 * It renders the not-found body itself instead of raising `notFound()`: see
 * `@/components/NotFoundViews` for why that is the difference between finished
 * HTML and an empty document.
 */
export const metadata: Metadata = notFoundRobots;

export default async function StorefrontCatchAll({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  return store ? <StorefrontNotFoundView store={store} /> : <UnknownStoreView slug={slug} />;
}

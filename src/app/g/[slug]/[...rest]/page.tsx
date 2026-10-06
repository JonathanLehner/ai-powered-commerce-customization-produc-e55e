import type { Metadata } from "next";
import {
  GiftPortalNotFoundView,
  notFoundRobots,
  UnknownGiftPortalView,
} from "@/components/NotFoundViews";
import { getGiftCatalogueBySlug, getStore } from "@/lib/data";

/**
 * Any address inside a gift portal that matches no page. Like the storefront
 * catch-all it renders the body itself, so the portal chrome and the way out
 * arrive as HTML rather than only in the client payload.
 */
export const metadata: Metadata = notFoundRobots;

export default async function GiftPortalCatchAll({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const catalogue = await getGiftCatalogueBySlug(slug);
  // The store comes with it, because the body reads in that store's language.
  const store = catalogue ? await getStore(catalogue.storeId) : null;
  return catalogue ? (
    <GiftPortalNotFoundView catalogue={catalogue} store={store} />
  ) : (
    <UnknownGiftPortalView slug={slug} />
  );
}

import { hasApprovedPreviews } from "./artwork";
import type { MenuLookups } from "./content";
import type { StorefrontData } from "./storefront-data";
import type { StoreProduct } from "./types";

/**
 * What the store's menu links resolve to, from the records read with the
 * store: collections by handle, products on sale by slug, published pages and
 * posts by handle. A link whose target is missing here is left out.
 */
export function menuLookups(data: Pick<StorefrontData, "collections" | "menuLinks">): MenuLookups {
  const live = data.menuLinks.products.filter(
    (product) =>
      product.status === "published" &&
      product.visibility === "public" &&
      hasApprovedPreviews(product as Pick<StoreProduct, "artworks" | "mockups" | "giftCard">),
  );
  return {
    collections: new Map(data.collections.map((c) => [c.id, c.handle])),
    products: new Map(live.map((p) => [p.id, p.slug])),
    pages: new Map(data.menuLinks.entries.filter((e) => e.kind === "page").map((e) => [e.id, e.handle])),
    posts: new Map(data.menuLinks.entries.filter((e) => e.kind === "post").map((e) => [e.id, e.handle])),
  };
}

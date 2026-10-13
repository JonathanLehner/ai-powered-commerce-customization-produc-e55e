import "server-only";
import { failsPreflight, sellsOwnPhotos } from "./artwork";
import { COLLECTIONS, getStore, recordAudit } from "./data";
import { db } from "./mongo";
import type { CatalogProduct, StoreProduct } from "./types";
import { emitProductWebhook } from "./webhook-events";

/**
 * A published product whose artwork fails the supplier's file check cannot be
 * produced, so it cannot stay on the storefront. Supplier requirements can
 * change after a product went live, so this runs wherever products are read as
 * live: the storefront listings and product page, the workspace catalog and
 * overview, the Admin API, and the scheduler.
 *
 * Returns `products` with every failing one moved to in review. Pass the
 * supplier listings when the caller has them, to spare the read.
 */
export async function takeOffFailingPreflight<T extends StoreProduct>(
  products: T[],
  catalogs?: Map<string, Pick<CatalogProduct, "printAreas" | "fileRequirements"> | null>,
): Promise<T[]> {
  const live = products.filter((p) => p.status === "published" && p.artworks.length > 0 && !sellsOwnPhotos(p));
  if (live.length === 0) return products;
  const listings =
    catalogs ??
    new Map(
      (await db.findIn<CatalogProduct>(COLLECTIONS.catalog, "id", live.map((p) => p.catalogProductId))).map((c) => [c.id, c]),
    );
  const failing = live.filter((p) => failsPreflight(p, listings.get(p.catalogProductId) ?? null));
  if (failing.length === 0) return products;

  await Promise.all(failing.map(takeOff));
  const ids = new Set(failing.map((p) => p.id));
  return products.map((p) =>
    ids.has(p.id) ? { ...p, status: "in_review" as const, unpublishedReason: "preflight_failed" as const } : p,
  );
}

/**
 * Only the write that actually moves the product records and notifies, so two
 * requests that find the same product at once tell the team once.
 */
async function takeOff(product: StoreProduct): Promise<void> {
  const result = await db.updateOne(
    COLLECTIONS.storeProducts,
    { id: product.id, status: "published" },
    { $set: { status: "in_review", unpublishedReason: "preflight_failed", updatedAt: new Date().toISOString() } },
  );
  if (result.modifiedCount !== 1) return;
  const store = await getStore(product.storeId);
  recordAudit({
    category: "publishing",
    action: "product.in_review",
    summary: `Took “${product.name}” off the storefront because its artwork failed the supplier's file check`,
    storeId: product.storeId,
    agencyId: store?.agencyId ?? null,
    actorId: "system",
    actorName: "Parcelith pre-flight",
    entity: "store_product",
    entityId: product.id,
    meta: { status: "in_review", reason: "preflight_failed" },
    notify: {
      type: "product_unpublished",
      href: `/app/stores/${product.storeId}/catalog/${product.id}`,
      params: { name: product.name },
    },
  });
  emitProductWebhook(product.storeId, product.id, "product.updated");
}

/** Every published product on the platform, checked in one pass. Run by the scheduler. */
export async function sweepPreflight(): Promise<number> {
  const published = await db.find<StoreProduct>(COLLECTIONS.storeProducts, { status: "published" });
  const checked = await takeOffFailingPreflight(published);
  return checked.filter((p, i) => p !== published[i]).length;
}

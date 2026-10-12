import "server-only";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { applyOrder, cleanIdList, COLLECTION_LIMITS, isValidHandle, normalizeHandle, uniqueHandle } from "../collections";
import {
  createProductCollection,
  deleteProductCollection,
  getProductCollection,
  listProductCollections,
  listStoreProducts,
  recordAudit,
  updateProductCollection,
} from "../data";
import type { ProductCollection } from "../types";
import { newId } from "../util";
import { OperationError, type OperationContext } from "./context";

/**
 * Collections are part of the catalog. Lists sent in are cleaned against the
 * store's own records before they are written. The workspace's collection
 * actions and the Admin API both run these.
 */

export function auditCollection(
  ctx: OperationContext,
  action: string,
  summary: string,
  collectionId: string,
  meta: Record<string, string | number> = {},
) {
  recordAudit({
    category: "publishing",
    action,
    summary,
    storeId: ctx.store.id,
    agencyId: ctx.store.agencyId,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "collection",
    entityId: collectionId,
    meta,
  });
}

export function revalidateCollections(ctx: OperationContext, collectionId?: string) {
  revalidatePath(`/app/stores/${ctx.store.id}/catalog/collections`);
  if (collectionId) revalidatePath(`/app/stores/${ctx.store.id}/catalog/collections/${collectionId}`);
  revalidatePath(`/s/${ctx.store.slug}`, "layout");
}

/** The collection, provided it belongs to the store. */
export async function findCollection(storeId: string, collectionId: string): Promise<ProductCollection | null> {
  const collection = await getProductCollection(collectionId);
  return collection && collection.storeId === storeId ? collection : null;
}

async function checkText(ctx: OperationContext, name: string, description: string) {
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.collections" });
  if (name.length < 2) throw new OperationError("invalid", t("nameRequired"), "name");
  if (name.length > COLLECTION_LIMITS.name) throw new OperationError("invalid", t("nameTooLong"), "name");
  if (description.length > COLLECTION_LIMITS.description) {
    throw new OperationError("invalid", t("descriptionTooLong"), "description");
  }
  return t;
}

/**
 * Creates an empty collection at the end of the store's list. A resubmitted
 * form (double click, retry, a stale tab) gets back the collection it already
 * created rather than making a second one.
 */
export async function createCollection(
  ctx: OperationContext,
  input: { name: string; description: string; submissionKey: string | null },
): Promise<{ collection: ProductCollection; created: boolean }> {
  const name = input.name.trim();
  const description = input.description.trim();
  await checkText(ctx, name, description);

  const existing = await listProductCollections(ctx.store.id);
  const already = input.submissionKey ? existing.find((c) => c.submissionKey === input.submissionKey) : undefined;
  if (already) return { collection: already, created: false };

  const now = new Date().toISOString();
  const collection: ProductCollection = {
    id: newId("col"),
    storeId: ctx.store.id,
    name,
    handle: uniqueHandle(name, existing.map((c) => c.handle)),
    description,
    imageUrl: null,
    productIds: [],
    position: existing.reduce((max, c) => Math.max(max, c.position), -1) + 1,
    translations: {},
    submissionKey: input.submissionKey,
    createdAt: now,
    updatedAt: now,
  };
  await createProductCollection(collection);
  auditCollection(ctx, "collection.created", `Created the collection “${name}”`, collection.id);
  revalidateCollections(ctx);
  return { collection, created: true };
}

export async function saveCollectionDetails(
  ctx: OperationContext,
  collection: ProductCollection,
  input: { name: string; description: string; handle: string; imageUrl: string | null },
): Promise<ProductCollection> {
  const name = input.name.trim();
  const description = input.description.trim();
  const handle = normalizeHandle(input.handle);
  const t = await checkText(ctx, name, description);
  if (!isValidHandle(handle)) throw new OperationError("invalid", t("handleInvalid"), "handle");
  if (handle !== collection.handle) {
    const others = await listProductCollections(ctx.store.id);
    if (others.some((c) => c.id !== collection.id && c.handle === handle)) {
      throw new OperationError("conflict", t("handleTaken"), "handle");
    }
  }
  const imageUrl = input.imageUrl;

  await updateProductCollection(collection.id, {}, { name, description, handle, imageUrl });
  const changes = [
    name !== collection.name ? `renamed “${collection.name}” to “${name}”` : null,
    handle !== collection.handle ? `changed the handle to ${handle}` : null,
    description !== collection.description ? "edited the description" : null,
    imageUrl !== collection.imageUrl ? (imageUrl ? "changed the image" : "removed the image") : null,
  ].filter(Boolean);
  if (changes.length > 0) {
    auditCollection(ctx, "collection.updated", `Collection “${name}”: ${changes.join(", ")}`, collection.id);
  }
  revalidateCollections(ctx, collection.id);
  return { ...collection, name, description, handle, imageUrl };
}

/* ------------------------------------------------------------------- order */

/** Puts the store's collections in the order given; ones left out keep their place after them. Returns the ids in their new order. */
export async function reorderCollections(ctx: OperationContext, ids: unknown): Promise<string[]> {
  const collections = await listProductCollections(ctx.store.id);
  const current = collections.map((c) => c.id);
  const next = applyOrder(current, cleanIdList(ids, current));
  await Promise.all(
    next.flatMap((id, position) => {
      const collection = collections.find((c) => c.id === id);
      return collection && collection.position !== position ? [updateProductCollection(id, {}, { position })] : [];
    }),
  );
  auditCollection(ctx, "collection.reordered", "Reordered the store's collections", ctx.store.id, { count: next.length });
  revalidateCollections(ctx);
  return next;
}

/* ---------------------------------------------------------------- products */

/**
 * Changes a collection's product list against what is stored now, not against
 * what the caller last saw: the write is guarded on the version it read and
 * retried, so two people editing at once both land, and repeating a request
 * changes nothing the first one did not. Null when the collection is gone.
 */
async function changeProducts(
  ctx: OperationContext,
  collectionId: string,
  change: (current: string[], allowed: string[]) => string[],
): Promise<{ collection: ProductCollection; before: string[]; after: string[] } | null> {
  const products = await listStoreProducts(ctx.store.id);
  const allowed = products.filter((p) => p.status !== "archived").map((p) => p.id);
  for (let attempt = 0; attempt < 5; attempt++) {
    const collection = await findCollection(ctx.store.id, collectionId);
    if (!collection) return null;
    const before = collection.productIds;
    const after = change(before, allowed);
    if (after.join() === before.join()) return { collection, before, after };
    if (await updateProductCollection(collection.id, { updatedAt: collection.updatedAt }, { productIds: after })) {
      return { collection, before, after };
    }
  }
  return null;
}

async function notFound(ctx: OperationContext): Promise<never> {
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.collections" });
  throw new OperationError("not_found", t("notFound"));
}

/** Adds products to the end of a collection. Returns the list as it now stands. */
export async function addCollectionProducts(
  ctx: OperationContext,
  collectionId: string,
  productIds: unknown,
): Promise<{ productIds: string[]; added: number }> {
  const result = await changeProducts(ctx, collectionId, (current, allowed) => [
    ...current,
    ...cleanIdList(productIds, allowed).filter((id) => !current.includes(id)),
  ]);
  if (!result) return notFound(ctx);
  const added = result.after.length - result.before.length;
  if (added > 0) {
    auditCollection(
      ctx,
      "collection.products_added",
      `Added ${added} ${added === 1 ? "product" : "products"} to the collection “${result.collection.name}”`,
      result.collection.id,
      { added },
    );
  }
  revalidateCollections(ctx, result.collection.id);
  return { productIds: result.after, added };
}

export async function removeCollectionProduct(
  ctx: OperationContext,
  collectionId: string,
  productId: string,
): Promise<{ productIds: string[] }> {
  const result = await changeProducts(ctx, collectionId, (current) => current.filter((id) => id !== productId));
  if (!result) return notFound(ctx);
  if (result.after.length < result.before.length) {
    auditCollection(
      ctx,
      "collection.product_removed",
      `Removed a product from the collection “${result.collection.name}”`,
      result.collection.id,
      { productId },
    );
  }
  revalidateCollections(ctx, result.collection.id);
  return { productIds: result.after };
}

/** Puts the collection's products in the order given; ones left out keep their place after them. */
export async function reorderCollectionProducts(
  ctx: OperationContext,
  collectionId: string,
  productIds: unknown,
): Promise<{ productIds: string[] }> {
  const result = await changeProducts(ctx, collectionId, (current) =>
    applyOrder(current, cleanIdList(productIds, current)),
  );
  if (!result) return notFound(ctx);
  if (result.after.join() !== result.before.join()) {
    auditCollection(
      ctx,
      "collection.products_reordered",
      `Reordered the products in the collection “${result.collection.name}”`,
      result.collection.id,
    );
  }
  revalidateCollections(ctx, result.collection.id);
  return { productIds: result.after };
}

export async function deleteCollection(ctx: OperationContext, collection: ProductCollection): Promise<void> {
  await deleteProductCollection(collection.id);
  auditCollection(ctx, "collection.deleted", `Deleted the collection “${collection.name}”`, collection.id);
  revalidateCollections(ctx);
}

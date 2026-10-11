"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createProductCollection,
  deleteProductCollection,
  getProductCollection,
  listProductCollections,
  listStoreProducts,
  recordAudit,
  updateProductCollection,
} from "@/lib/data";
import {
  applyOrder,
  cleanIdList,
  COLLECTION_LIMITS,
  isValidHandle,
  normalizeHandle,
  uniqueHandle,
} from "@/lib/collections";
import { assertStoreAccess } from "@/lib/session";
import type { ProductCollection, Store, User } from "@/lib/types";
import { readStoredImage } from "@/lib/uploads";
import { newId } from "@/lib/util";
import type { ActionState } from "./stores";

/**
 * Collections are part of the catalog, so every write needs catalog rights in
 * the store the collection belongs to. Lists sent back from the browser are
 * cleaned against the store's own records before they are written.
 */

function audit(store: Store, user: User, action: string, summary: string, collectionId: string, meta: Record<string, string | number> = {}) {
  recordAudit({
    category: "publishing",
    action,
    summary,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "collection",
    entityId: collectionId,
    meta,
  });
}

function refresh(store: Store, collectionId?: string) {
  revalidatePath(`/app/stores/${store.id}/catalog/collections`);
  if (collectionId) revalidatePath(`/app/stores/${store.id}/catalog/collections/${collectionId}`);
  revalidatePath(`/s/${store.slug}`, "layout");
}

async function loadCollection(storeId: string, collectionId: string) {
  const [access, collection] = await Promise.all([
    assertStoreAccess(storeId, "store.catalog"),
    getProductCollection(collectionId),
  ]);
  return { ...access, collection: collection && collection.storeId === storeId ? collection : null };
}

/* ------------------------------------------------------------------ create */

export async function createCollection(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const submissionKey = String(formData.get("submissionKey") ?? "") || null;
  const { user, store } = await assertStoreAccess(storeId, "store.catalog");
  const t = await getTranslations("actions.collections");

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (name.length < 2) return { status: "error", message: t("nameRequired"), field: "name" };
  if (name.length > COLLECTION_LIMITS.name) return { status: "error", message: t("nameTooLong"), field: "name" };
  if (description.length > COLLECTION_LIMITS.description) {
    return { status: "error", message: t("descriptionTooLong"), field: "description" };
  }

  const existing = await listProductCollections(storeId);
  // A resubmitted form (double click, retry, a stale tab) lands on the
  // collection it already created rather than making a second one.
  const already = submissionKey ? existing.find((c) => c.submissionKey === submissionKey) : undefined;
  if (already) redirect(`/app/stores/${storeId}/catalog/collections/${already.id}`);

  const now = new Date().toISOString();
  const collection: ProductCollection = {
    id: newId("col"),
    storeId,
    name,
    handle: uniqueHandle(name, existing.map((c) => c.handle)),
    description,
    imageUrl: null,
    productIds: [],
    position: existing.reduce((max, c) => Math.max(max, c.position), -1) + 1,
    translations: {},
    submissionKey,
    createdAt: now,
    updatedAt: now,
  };
  await createProductCollection(collection);
  audit(store, user, "collection.created", `Created the collection “${name}”`, collection.id);
  refresh(store);
  redirect(`/app/stores/${storeId}/catalog/collections/${collection.id}?created=1`);
}

/* ----------------------------------------------------------------- details */

export async function saveCollectionDetails(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const collectionId = String(formData.get("collectionId") ?? "");
  const { user, store, collection } = await loadCollection(storeId, collectionId);
  const t = await getTranslations("actions.collections");
  if (!collection) return { status: "error", message: t("notFound") };

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const handle = normalizeHandle(String(formData.get("handle") ?? ""));
  if (name.length < 2) return { status: "error", message: t("nameRequired"), field: "name" };
  if (name.length > COLLECTION_LIMITS.name) return { status: "error", message: t("nameTooLong"), field: "name" };
  if (description.length > COLLECTION_LIMITS.description) {
    return { status: "error", message: t("descriptionTooLong"), field: "description" };
  }
  if (!isValidHandle(handle)) return { status: "error", message: t("handleInvalid"), field: "handle" };
  if (handle !== collection.handle) {
    const others = await listProductCollections(storeId);
    if (others.some((c) => c.id !== collection.id && c.handle === handle)) {
      return { status: "error", message: t("handleTaken"), field: "handle" };
    }
  }

  const uploaded = readStoredImage(formData, "image", "collection");
  const imageUrl = formData.get("removeImage") === "1" ? null : (uploaded?.url ?? collection.imageUrl);

  await updateProductCollection(collection.id, {}, { name, description, handle, imageUrl });
  const changes = [
    name !== collection.name ? `renamed “${collection.name}” to “${name}”` : null,
    handle !== collection.handle ? `changed the handle to ${handle}` : null,
    description !== collection.description ? "edited the description" : null,
    imageUrl !== collection.imageUrl ? (imageUrl ? "changed the image" : "removed the image") : null,
  ].filter(Boolean);
  if (changes.length > 0) {
    audit(store, user, "collection.updated", `Collection “${name}”: ${changes.join(", ")}`, collection.id);
  }
  refresh(store, collection.id);
  return { status: "success", message: t("saved") };
}

/* ------------------------------------------------------------------- order */

export interface OrderResult extends ActionState {
  ids?: string[];
}

/** Applies the order the list was dragged into. */
export async function reorderCollections(input: { storeId: string; ids: string[] }): Promise<OrderResult> {
  const { user, store } = await assertStoreAccess(input.storeId, "store.catalog");
  const t = await getTranslations("actions.collections");
  const collections = await listProductCollections(store.id);
  const current = collections.map((c) => c.id);
  const next = applyOrder(current, cleanIdList(input.ids, current));
  await Promise.all(
    next.flatMap((id, position) => {
      const collection = collections.find((c) => c.id === id);
      return collection && collection.position !== position ? [updateProductCollection(id, {}, { position })] : [];
    }),
  );
  audit(store, user, "collection.reordered", "Reordered the store's collections", store.id, { count: next.length });
  refresh(store);
  return { status: "success", message: t("orderSaved"), ids: next };
}

/* ---------------------------------------------------------------- products */

export interface ProductsResult extends ActionState {
  productIds?: string[];
}

/**
 * Changes a collection's product list against what is stored now, not against
 * what the tab last saw: the write is guarded on the version it read and
 * retried, so two people editing at once both land, and repeating a request
 * changes nothing the first one did not.
 */
async function changeProducts(
  storeId: string,
  collectionId: string,
  change: (current: string[], allowed: string[]) => string[],
): Promise<{ store: Store; user: User; collection: ProductCollection; before: string[]; after: string[] } | null> {
  const [{ user, store }, products] = await Promise.all([
    assertStoreAccess(storeId, "store.catalog"),
    listStoreProducts(storeId),
  ]);
  const allowed = products.filter((p) => p.status !== "archived").map((p) => p.id);
  for (let attempt = 0; attempt < 5; attempt++) {
    const collection = await getProductCollection(collectionId);
    if (!collection || collection.storeId !== storeId) return null;
    const before = collection.productIds;
    const after = change(before, allowed);
    if (after.join() === before.join()) return { store, user, collection, before, after };
    if (await updateProductCollection(collection.id, { updatedAt: collection.updatedAt }, { productIds: after })) {
      return { store, user, collection, before, after };
    }
  }
  return null;
}

export async function addCollectionProducts(input: {
  storeId: string;
  collectionId: string;
  productIds: string[];
}): Promise<ProductsResult> {
  const t = await getTranslations("actions.collections");
  const result = await changeProducts(input.storeId, input.collectionId, (current, allowed) => [
    ...current,
    ...cleanIdList(input.productIds, allowed).filter((id) => !current.includes(id)),
  ]);
  if (!result) return { status: "error", message: t("notFound") };
  const added = result.after.length - result.before.length;
  if (added > 0) {
    audit(
      result.store,
      result.user,
      "collection.products_added",
      `Added ${added} ${added === 1 ? "product" : "products"} to the collection “${result.collection.name}”`,
      result.collection.id,
      { added },
    );
  }
  refresh(result.store, result.collection.id);
  return { status: "success", message: t("productsAdded", { count: added }), productIds: result.after };
}

export async function removeCollectionProduct(input: {
  storeId: string;
  collectionId: string;
  productId: string;
}): Promise<ProductsResult> {
  const t = await getTranslations("actions.collections");
  const result = await changeProducts(input.storeId, input.collectionId, (current) =>
    current.filter((id) => id !== input.productId),
  );
  if (!result) return { status: "error", message: t("notFound") };
  if (result.after.length < result.before.length) {
    audit(
      result.store,
      result.user,
      "collection.product_removed",
      `Removed a product from the collection “${result.collection.name}”`,
      result.collection.id,
      { productId: input.productId },
    );
  }
  refresh(result.store, result.collection.id);
  return { status: "success", message: t("productRemoved"), productIds: result.after };
}

export async function reorderCollectionProducts(input: {
  storeId: string;
  collectionId: string;
  productIds: string[];
}): Promise<ProductsResult> {
  const t = await getTranslations("actions.collections");
  const result = await changeProducts(input.storeId, input.collectionId, (current) =>
    applyOrder(current, cleanIdList(input.productIds, current)),
  );
  if (!result) return { status: "error", message: t("notFound") };
  if (result.after.join() !== result.before.join()) {
    audit(
      result.store,
      result.user,
      "collection.products_reordered",
      `Reordered the products in the collection “${result.collection.name}”`,
      result.collection.id,
    );
  }
  refresh(result.store, result.collection.id);
  return { status: "success", message: t("orderSaved"), productIds: result.after };
}

/* ------------------------------------------------------------------ delete */

export async function deleteCollection(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const collectionId = String(formData.get("collectionId") ?? "");
  const { user, store, collection } = await loadCollection(storeId, collectionId);
  if (collection) {
    await deleteProductCollection(collection.id);
    audit(store, user, "collection.deleted", `Deleted the collection “${collection.name}”`, collection.id);
    refresh(store);
  }
  redirect(`/app/stores/${storeId}/catalog/collections`);
}

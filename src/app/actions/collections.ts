"use server";

import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { refusal } from "@/lib/operations/action-state";
import {
  addCollectionProducts as addProducts,
  createCollection as addCollection,
  deleteCollection as removeCollection,
  findCollection,
  removeCollectionProduct as removeProduct,
  reorderCollectionProducts as reorderProducts,
  reorderCollections as reorderStoreCollections,
  saveCollectionDetails as saveDetails,
} from "@/lib/operations/collections";
import type { OperationContext } from "@/lib/operations/context";
import { assertStoreAccess, operationContext } from "@/lib/session";
import { readStoredImage } from "@/lib/uploads";
import type { ActionState } from "./stores";

/**
 * Collections are part of the catalog, so every write needs catalog rights in
 * the store the collection belongs to.
 */

async function loadCollection(storeId: string, collectionId: string) {
  const [access, collection] = await Promise.all([
    assertStoreAccess(storeId, "store.catalog"),
    findCollection(storeId, collectionId),
  ]);
  return { ...access, collection };
}

/* ------------------------------------------------------------------ create */

export async function createCollection(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, "store.catalog");

  let outcome;
  try {
    outcome = await addCollection(await operationContext(access), {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      submissionKey: String(formData.get("submissionKey") ?? "") || null,
    });
  } catch (error) {
    return refusal(error);
  }
  // A resubmitted form lands on the collection it already created.
  if (!outcome.created) redirect(`/app/stores/${storeId}/catalog/collections/${outcome.collection.id}`);
  redirect(`/app/stores/${storeId}/catalog/collections/${outcome.collection.id}?created=1`);
}

/* ----------------------------------------------------------------- details */

export async function saveCollectionDetails(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const collectionId = String(formData.get("collectionId") ?? "");
  const { collection, ...access } = await loadCollection(storeId, collectionId);
  const t = await getTranslations("actions.collections");
  if (!collection) return { status: "error", message: t("notFound") };

  const uploaded = readStoredImage(formData, "image", "collection");
  try {
    await saveDetails(await operationContext(access), collection, {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      handle: String(formData.get("handle") ?? ""),
      imageUrl: formData.get("removeImage") === "1" ? null : (uploaded?.url ?? collection.imageUrl),
    });
  } catch (error) {
    return refusal(error);
  }
  return { status: "success", message: t("saved") };
}

/* ------------------------------------------------------------------- order */

export interface OrderResult extends ActionState {
  ids?: string[];
}

/** Applies the order the list was dragged into. */
export async function reorderCollections(input: { storeId: string; ids: string[] }): Promise<OrderResult> {
  const access = await assertStoreAccess(input.storeId, "store.catalog");
  const t = await getTranslations("actions.collections");
  const next = await reorderStoreCollections(await operationContext(access), input.ids);
  return { status: "success", message: t("orderSaved"), ids: next };
}

/* ---------------------------------------------------------------- products */

export interface ProductsResult extends ActionState {
  productIds?: string[];
}

async function productsResult(
  storeId: string,
  run: (ctx: OperationContext) => Promise<{ productIds: string[] }>,
  message: (t: Awaited<ReturnType<typeof getTranslations<"actions.collections">>>, productIds: string[]) => string,
): Promise<ProductsResult> {
  const access = await assertStoreAccess(storeId, "store.catalog");
  const t = await getTranslations("actions.collections");
  try {
    const { productIds } = await run(await operationContext(access));
    return { status: "success", message: message(t, productIds), productIds };
  } catch (error) {
    return refusal(error);
  }
}

export async function addCollectionProducts(input: {
  storeId: string;
  collectionId: string;
  productIds: string[];
}): Promise<ProductsResult> {
  let added = 0;
  return productsResult(
    input.storeId,
    async (ctx) => {
      const result = await addProducts(ctx, input.collectionId, input.productIds);
      added = result.added;
      return result;
    },
    (t) => t("productsAdded", { count: added }),
  );
}

export async function removeCollectionProduct(input: {
  storeId: string;
  collectionId: string;
  productId: string;
}): Promise<ProductsResult> {
  return productsResult(
    input.storeId,
    (ctx) => removeProduct(ctx, input.collectionId, input.productId),
    (t) => t("productRemoved"),
  );
}

export async function reorderCollectionProducts(input: {
  storeId: string;
  collectionId: string;
  productIds: string[];
}): Promise<ProductsResult> {
  return productsResult(
    input.storeId,
    (ctx) => reorderProducts(ctx, input.collectionId, input.productIds),
    (t) => t("orderSaved"),
  );
}

/* ------------------------------------------------------------------ delete */

export async function deleteCollection(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const collectionId = String(formData.get("collectionId") ?? "");
  const { collection, ...access } = await loadCollection(storeId, collectionId);
  if (collection) await removeCollection(await operationContext(access), collection);
  redirect(`/app/stores/${storeId}/catalog/collections`);
}

"use server";

import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { getStoreProduct } from "@/lib/data";
import type { PublishBlocker } from "@/lib/publish-blockers";
import { readStoredImage } from "@/lib/uploads";
import { refusal } from "@/lib/operations/action-state";
import {
  generateMockups as renderMockups,
  rejectMockups as clearMockups,
  saveArtworkPlacement as placeArtworkAt,
  type PlacementChange,
  type RenderedMockup,
} from "@/lib/operations/artwork";
import { isOperationError } from "@/lib/operations/context";
import {
  approveMockups as approvePreviews,
  attachArtwork as placeArtwork,
  bulkUpdateProducts as updateProducts,
  deleteProduct as removeProduct,
  importProduct,
  linkImportedProduct as linkProduct,
  markMerchantFulfilled as markFulfilled,
  productPublishBlockers,
  removeArtwork as deleteArtwork,
  saveProductDetails as saveDetails,
  saveVariants as updateVariants,
  setProductStatus as moveProduct,
  type BulkProductAction,
  type BulkProductOutcome as ProductsOutcome,
} from "@/lib/operations/products";
import { assertStoreAccess, operationContext } from "@/lib/session";
import type { StoreProduct } from "@/lib/types";
import { parseMoney } from "@/lib/util";
import type { ActionState } from "./stores";

/* ------------------------------------------------------------------ import */

/** Back to the sourcing page, asking "you already have this — copy it again?". */
function sourcingConfirmHref(storeId: string, catalogId: string, filters: string): string {
  const params = new URLSearchParams(filters);
  params.set("confirm", catalogId);
  return `/app/stores/${storeId}/sourcing?${params.toString()}`;
}

/** Back to the sourcing page with the request-for-quote form open on a listing. */
function sourcingQuoteHref(storeId: string, catalogId: string, filters: string): string {
  const params = new URLSearchParams(filters);
  params.delete("confirm");
  params.set("rfq", catalogId);
  return `/app/stores/${storeId}/sourcing?${params.toString()}#rfq`;
}

export async function importCatalogProduct(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const catalogId = String(formData.get("catalogId") ?? "");
  const importKey = String(formData.get("importKey") ?? "") || null;
  const confirmed = formData.get("confirmed") === "1";
  const filters = String(formData.get("filters") ?? "");
  const access = await assertStoreAccess(storeId, "store.catalog");
  const outcome = await importProduct(await operationContext(access), { catalogId, importKey, confirmed });

  // A resubmission lands on the product it already made; a quote-priced listing
  // opens the enquiry form; a second copy of a product needs a decision first.
  if (outcome.kind === "existing") {
    redirect(`/app/stores/${storeId}/catalog/${outcome.product.id}?imported=${outcome.copies > 1 ? "copy" : "1"}`);
  }
  if (outcome.kind === "quote_only") redirect(sourcingQuoteHref(storeId, catalogId, filters));
  if (outcome.kind === "needs_confirmation") redirect(sourcingConfirmHref(storeId, catalogId, filters));
  redirect(`/app/stores/${storeId}/catalog/${outcome.product.id}?imported=${outcome.copyNumber > 1 ? "copy" : "1"}`);
}

/* --------------------------------------------------------------- details */

/**
 * Access check and product read run together rather than one after the other —
 * neither needs the other's answer, and each is a round trip to the platform.
 */
async function loadProduct(storeId: string, productId: string) {
  const [access, product] = await Promise.all([
    assertStoreAccess(storeId, "store.catalog"),
    getStoreProduct(productId),
  ]);
  if (!product || product.storeId !== storeId) throw new Error("Product not found in this store.");
  return { ...access, product };
}

export async function saveProductDetails(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const { product, ...access } = await loadProduct(storeId, productId);
  const t = await getTranslations("actions.products");

  try {
    const saved = await saveDetails(await operationContext(access), product, {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      tags: String(formData.get("tags") ?? "").split(","),
      price: parseMoney(String(formData.get("price") ?? ""), product.currency),
      taxBracketId: String(formData.get("taxBracketId") ?? "") || null,
      visibility: formData.get("visibility") === "hidden" ? "hidden" : "public",
      shopperCustomization: {
        artworkUpload: formData.get("shopperArtwork") === "on",
        textLine: formData.get("shopperText") === "on",
        textLabel: String(formData.get("textLabel") ?? "Personalisation"),
        maxTextLength: Number(formData.get("maxTextLength") ?? 18),
      },
    });
    return { status: "success", message: t("saved", { margin: saved.costs.marginPct.toFixed(1) }) };
  } catch (error) {
    return refusal(error);
  }
}

export async function saveVariants(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const { product, ...access } = await loadProduct(storeId, productId);

  const changes = Object.fromEntries(
    product.variants.map((variant) => {
      const parsed = parseMoney(String(formData.get(`price_${variant.id}`) ?? ""), product.currency);
      const weight = String(formData.get(`weight_${variant.id}`) ?? "").trim();
      return [
        variant.id,
        {
          enabled: formData.get(`enabled_${variant.id}`) === "on",
          price: parsed ?? variant.price,
          // Blank leaves the weight as it was; anything else is checked by the operation.
          ...(weight ? { weightGrams: Number(weight) } : {}),
        },
      ];
    }),
  );

  const t = await getTranslations("actions.products");
  try {
    const saved = await updateVariants(await operationContext(access), product, changes);
    return { status: "success", message: t("variantsSaved", { count: saved.variants.filter((v) => v.enabled).length }) };
  } catch (error) {
    return refusal(error);
  }
}

/* ------------------------------------------------------- imported products */

export async function linkImportedProduct(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const { product, ...access } = await loadProduct(storeId, productId);
  const t = await getTranslations("actions.products");
  try {
    await linkProduct(await operationContext(access), product, String(formData.get("catalogProductId") ?? ""));
    return { status: "success", message: t("linked") };
  } catch (error) {
    return refusal(error);
  }
}

export async function markMerchantFulfilled(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const { product, ...access } = await loadProduct(storeId, productId);
  const t = await getTranslations("actions.products");
  try {
    await markFulfilled(
      await operationContext(access),
      product,
      parseMoney(String(formData.get("unitCost") ?? ""), product.currency),
    );
    return { status: "success", message: t("merchantFulfilled") };
  } catch (error) {
    return refusal(error);
  }
}

/* --------------------------------------------------------------- artwork */

/**
 * Records artwork that the browser has already put in the asset store through
 * `/api/uploads`. Only the metadata travels through the action, so the upload
 * is not bound by the 1 MB Server Action body limit.
 */
export async function attachArtwork(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const printAreaId = String(formData.get("printAreaId") ?? "");
  const { product, ...access } = await loadProduct(storeId, productId);
  const t = await getTranslations("actions.products");

  try {
    const { blockingIssues } = await placeArtwork(
      await operationContext(access),
      product,
      printAreaId,
      readStoredImage(formData, "artwork", "artwork"),
    );
    return {
      status: "success",
      message: blockingIssues ? t("uploadedIssues", { count: blockingIssues }) : t("uploaded"),
    };
  } catch (error) {
    return refusal(error);
  }
}

/**
 * Moving artwork is the most repeated action in the configurator, so it reads
 * as little as it can: the access check and the product, in one wave, and no
 * catalog entry or cost breakdown, because a position change alters neither.
 */
export async function saveArtworkPlacement(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const { product, ...access } = await loadProduct(storeId, productId);

  const changes: Record<string, PlacementChange> = {};
  for (const artwork of product.artworks) {
    const read = (key: string) => {
      const raw = formData.get(`${key}_${artwork.id}`);
      return raw === null ? undefined : Number(raw);
    };
    changes[artwork.id] = { x: read("x"), y: read("y"), scale: read("scale"), rotation: read("rotation") };
  }
  await placeArtworkAt(await operationContext(access), product, changes);
  const t = await getTranslations("actions.products");
  return { status: "success", message: t("placementSaved") };
}

export async function removeArtwork(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const artworkId = String(formData.get("artworkId") ?? "");
  const { product, ...access } = await loadProduct(storeId, productId);
  await deleteArtwork(await operationContext(access), product, artworkId);
}

/* --------------------------------------------------------------- mockups */

export async function generateMockups(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const { product, ...access } = await loadProduct(storeId, productId);
  const t = await getTranslations("actions.products");

  // Each placement is composited in the browser, stored through /api/uploads
  // and only its URL is posted back with the form, under its print area's id.
  const rendered: Record<string, RenderedMockup> = {};
  for (const { printAreaId } of product.artworks) {
    rendered[printAreaId] = {
      image: readStoredImage(formData, `mockup_${printAreaId}`, "mockup"),
      share: readStoredImage(formData, `mockupShare_${printAreaId}`, "mockup"),
    };
  }

  try {
    const { count } = await renderMockups(
      await operationContext(access),
      product,
      rendered,
      String(formData.get("colour") ?? ""),
    );
    return { status: "success", message: t("mockupsGenerated", { count }) };
  } catch (error) {
    return refusal(error);
  }
}

export async function approveMockups(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const { product, ...access } = await loadProduct(storeId, productId);
  await approvePreviews(await operationContext(access), product);
}

export async function rejectMockups(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const { product, ...access } = await loadProduct(storeId, productId);
  await clearMockups(await operationContext(access), product);
}

/* -------------------------------------------------------------- publishing */

export type { PublishBlocker };

/** Everything that must be true before a product can go live. */
export async function publishBlockers(productId: string): Promise<PublishBlocker[]> {
  const product = await getStoreProduct(productId);
  if (!product) {
    const t = await getTranslations("actions.products.blockers");
    return [{ code: "notFound", reason: t("notFound"), fix: t("reload") }];
  }
  // Anyone who can see the store's products may see what keeps one offline.
  await assertStoreAccess(product.storeId, "store.view");
  return productPublishBlockers(product);
}

export async function setProductStatus(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const status = String(formData.get("status") ?? "") as StoreProduct["status"];
  const { product, ...access } = await loadProduct(storeId, productId);
  // The product page shows what still blocks publishing, so a refusal needs no message here.
  await moveProduct(await operationContext(access), product, status);
}

/* ------------------------------------------------------------ bulk actions */

export type { BulkProductAction };

export interface BulkProductOutcome extends ProductsOutcome {
  /** Set when the whole request was refused, e.g. a signed-out session. */
  error?: string;
}

/**
 * Applies one action to the selected products of a store and reports each
 * one. Publishing runs the same checks as the product page's Publish button,
 * and every product gets its own audit entry.
 */
export async function bulkUpdateProducts(
  storeId: string,
  productIds: string[],
  action: BulkProductAction,
): Promise<BulkProductOutcome> {
  const refuse = (error: string): BulkProductOutcome => ({ error, succeeded: [], failed: [] });
  let access: Awaited<ReturnType<typeof assertStoreAccess>>;
  try {
    access = await assertStoreAccess(storeId, "store.catalog");
  } catch (error) {
    const t = await getTranslations("catalog.bulk");
    return refuse(error instanceof Error ? error.message : t("failedGeneric"));
  }
  try {
    return await updateProducts(await operationContext(access), productIds, action);
  } catch (error) {
    if (isOperationError(error)) return refuse(error.message);
    throw error;
  }
}

export async function deleteProduct(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const { product, ...access } = await loadProduct(storeId, productId);
  await removeProduct(await operationContext(access), product);
  redirect(`/app/stores/${storeId}/catalog`);
}
/** Void wrapper so the placement form can be a plain <form action={…}>. */
export async function persistPlacement(formData: FormData): Promise<void> {
  await saveArtworkPlacement({ status: "idle" }, formData);
}

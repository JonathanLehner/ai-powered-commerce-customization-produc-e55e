"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  COLLECTIONS,
  getCatalogProduct,
  getStoreProduct,
  listStoreProducts,
  listTaxBrackets,
  recordAudit,
  updateStoreProduct,
} from "@/lib/data";
import { publishBlockersFor, type PublishBlocker } from "@/lib/publish-blockers";
import { readStoredImage } from "@/lib/uploads";
import { db } from "@/lib/mongo";
import { breakdownFor } from "@/lib/pricing";
import {
  archiveBlock,
  bracketBlock,
  parsePriceChange,
  parseProductIds,
  priceBlock,
  publishBlock,
  repriceProduct,
  unpublishBlock,
  visibilityBlock,
  type PriceChange,
  type ProductBlock,
} from "@/lib/bulk-products";
import { refusal } from "@/lib/operations/action-state";
import {
  approveMockups as approvePreviews,
  attachArtwork as placeArtwork,
  importProduct,
  removeArtwork as deleteArtwork,
  saveProductDetails as saveDetails,
  saveVariants as updateVariants,
  setProductStatus as moveProduct,
} from "@/lib/operations/products";
import { assertStoreAccess, operationContext } from "@/lib/session";
import type { CatalogProduct, MockupImage, StoreProduct } from "@/lib/types";
import { formatMoney, newId, parseMoney } from "@/lib/util";
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

/** As `loadProduct`, plus the shared catalog entry the artwork is checked against. */
async function loadEditable(storeId: string, productId: string) {
  const loaded = await loadProduct(storeId, productId);
  const catalog = await getCatalogProduct(loaded.product.catalogProductId);
  return { ...loaded, catalog };
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
      return [variant.id, { enabled: formData.get(`enabled_${variant.id}`) === "on", price: parsed ?? variant.price }];
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

/**
 * Artwork and mockup edits can take a published product off the storefront (see
 * `updateStoreProduct`), so the shop pages are revalidated alongside the editor.
 */
function revalidateAfterArtworkChange(storeId: string, productId: string, storeSlug: string) {
  revalidatePath(`/app/stores/${storeId}/catalog`);
  revalidatePath(`/app/stores/${storeId}/catalog/${productId}`);
  revalidatePath(`/s/${storeSlug}`);
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
  const { store, product } = await loadProduct(storeId, productId);

  const artworks = product.artworks.map((artwork) => {
    const read = (key: string, fallback: number) => {
      const raw = formData.get(`${key}_${artwork.id}`);
      if (raw === null) return fallback;
      const value = Number(raw);
      return Number.isFinite(value) ? value : fallback;
    };
    return {
      ...artwork,
      x: read("x", artwork.x),
      y: read("y", artwork.y),
      scale: Math.max(0.05, Math.min(2, read("scale", artwork.scale))),
      rotation: Math.max(-180, Math.min(180, read("rotation", artwork.rotation))),
    };
  });

  // Saving a placement that has not moved would still cost a write, a cache
  // invalidation and a full re-render of the page.
  const moved = artworks.some((artwork, index) => {
    const before = product.artworks[index];
    return (
      artwork.x !== before.x ||
      artwork.y !== before.y ||
      artwork.scale !== before.scale ||
      artwork.rotation !== before.rotation
    );
  });
  const t = await getTranslations("actions.products");
  if (!moved) return { status: "success", message: t("placementSaved") };

  await updateStoreProduct(productId, { artworks, mockups: [] }, product);
  revalidateAfterArtworkChange(storeId, productId, store.slug);
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
  const { user, store, product, catalog } = await loadEditable(storeId, productId);
  const t = await getTranslations("actions.products");
  if (!catalog) return { status: "error", message: t("supplierMissing") };
  if (product.artworks.length === 0) {
    return { status: "error", message: t("artworkRequired") };
  }

  const colour = product.variants.find((v) => v.enabled)?.colour ?? catalog.variants[0]?.colour ?? "";
  const mockups: MockupImage[] = [];

  for (const artwork of product.artworks) {
    const area = catalog.printAreas.find((a) => a.id === artwork.printAreaId);
    if (!area) continue;
    const base =
      catalog.mockups.find((m) => m.view === area.view && m.colour === colour) ??
      catalog.mockups.find((m) => m.view === area.view);
    if (!base) continue;

    // The placement is composited in the browser, stored through /api/uploads
    // and only its URL is posted back with the form.
    const rendered = readStoredImage(formData, `mockup_${area.id}`, "mockup");
    if (!rendered) continue;
    const share = readStoredImage(formData, `mockupShare_${area.id}`, "mockup");

    mockups.push({
      id: newId("mck"),
      view: area.view,
      url: rendered.url,
      shareUrl: share?.url ?? null,
      colour: base.colour,
      generatedAt: new Date().toISOString(),
      approved: false,
      approvedBy: null,
      approvedAt: null,
    });
  }

  if (mockups.length === 0) {
    return {
      status: "error",
      message: t("noPreview"),
    };
  }

  await updateStoreProduct(productId, { mockups }, product);
  recordAudit({
    category: "product_import",
    action: "product.mockups_generated",
    summary: `Generated ${mockups.length} mockup${mockups.length === 1 ? "" : "s"} for “${product.name}”`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "store_product",
    entityId: productId,
    meta: { views: mockups.map((m) => m.view).join(", ") },
  });
  revalidateAfterArtworkChange(storeId, productId, store.slug);
  return {
    status: "success",
    message: t("mockupsGenerated", { count: mockups.length }),
  };
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
  const { user, store, product } = await loadProduct(storeId, productId);

  // Clearing the previews of a published product takes it off the storefront —
  // `updateStoreProduct` applies that demotion for every artwork/mockup write.
  await updateStoreProduct(productId, { mockups: [] as MockupImage[] }, product);
  recordAudit({
    category: "publishing",
    action: "product.mockups_rejected",
    summary: `Rejected the generated mockups for “${product.name}” and returned it for changes`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "store_product",
    entityId: productId,
    meta: {},
  });
  revalidateAfterArtworkChange(storeId, productId, store.slug);
}

/* -------------------------------------------------------------- publishing */

export type { PublishBlocker };

/** Everything that must be true before a product can go live. */
export async function publishBlockers(productId: string): Promise<PublishBlocker[]> {
  const product = await getStoreProduct(productId);
  if (!product) {
    const t = await getTranslations("actions.products.blockers");
    return [{ reason: t("notFound"), fix: t("reload") }];
  }
  return (await publishBlockersFor([product])).get(product.id) ?? [];
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

export type BulkProductAction =
  | { kind: "publish" }
  | { kind: "unpublish" }
  | { kind: "archive" }
  | { kind: "bracket"; bracketId: string }
  | { kind: "visibility"; visibility: StoreProduct["visibility"] }
  /**
   * `from` is each product's price when the margins were previewed. A product
   * whose price has moved since is skipped, so a replayed request does not
   * raise the same prices twice.
   */
  | { kind: "price"; change: PriceChange; from: Record<string, number> };

export interface BulkProductOutcome {
  /** Set when the whole request was refused, e.g. a signed-out session. */
  error?: string;
  succeeded: { id: string; name: string }[];
  failed: { id: string; name: string; reason: string }[];
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
  const t = await getTranslations("catalog.bulk");
  const refuse = (error: string): BulkProductOutcome => ({ error, succeeded: [], failed: [] });
  let access: Awaited<ReturnType<typeof assertStoreAccess>>;
  try {
    access = await assertStoreAccess(storeId, "store.catalog");
  } catch (error) {
    return refuse(error instanceof Error ? error.message : t("failedGeneric"));
  }
  const { user, store } = access;
  const ids = parseProductIds(productIds);
  if (ids.length === 0) return refuse(t("noneSelected"));

  const kind = action?.kind;
  if (!["publish", "unpublish", "archive", "bracket", "visibility", "price"].includes(kind)) {
    return refuse(t("failedGeneric"));
  }
  const change = action.kind === "price" ? parsePriceChange(action.change) : null;
  if (action.kind === "price" && !change) return refuse(t("price.invalid"));
  const brackets = kind === "price" || kind === "bracket" ? await listTaxBrackets() : [];
  const bracket = action.kind === "bracket" ? brackets.find((b) => b.id === action.bracketId) : undefined;
  if (kind === "bracket" && !bracket) return refuse(t("failedGeneric"));
  if (action.kind === "visibility" && action.visibility !== "public" && action.visibility !== "hidden") {
    return refuse(t("failedGeneric"));
  }

  const wanted = new Set(ids);
  const products = (await listStoreProducts(storeId)).filter((p) => wanted.has(p.id));
  const outcome: BulkProductOutcome = { succeeded: [], failed: [] };
  const found = new Set(products.map((p) => p.id));
  for (const id of ids) {
    if (!found.has(id)) outcome.failed.push({ id, name: id, reason: t("notFound") });
  }

  const blockers = kind === "publish" ? await publishBlockersFor(products.filter((p) => p.status !== "published")) : null;
  const catalogs = new Map<string, CatalogProduct | null>();
  if (kind === "price" || kind === "bracket") {
    const catalogIds = [...new Set(products.map((p) => p.catalogProductId))];
    for (const [id, catalog] of await Promise.all(
      catalogIds.map(async (id) => [id, await getCatalogProduct(id)] as const),
    )) {
      catalogs.set(id, catalog);
    }
  }
  const costsFor = (product: StoreProduct) =>
    breakdownFor(
      product,
      catalogs.get(product.catalogProductId) ?? null,
      brackets.find((b) => b.id === product.taxBracketId) ?? null,
      store.pricesIncludeTax,
    );
  const audit = {
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "store_product",
  };

  async function apply(product: StoreProduct): Promise<string | null> {
    const blocked = (reason: ProductBlock) => t(`blocked.${reason}`);
    if (kind === "publish") {
      const list = blockers?.get(product.id) ?? [];
      const block = publishBlock({ status: product.status, publishBlockers: list.map((b) => b.reason) });
      if (block === "notReady") return list.map((b) => b.reason).join(" ");
      if (block) return blocked(block);
      await updateStoreProduct(
        product.id,
        { status: "published", publishedAt: new Date().toISOString(), unpublishedReason: null },
        product,
      );
      recordAudit({
        ...audit,
        category: "publishing",
        action: "product.published",
        summary: `Published “${product.name}” at ${formatMoney(product.price, product.currency)}`,
        entityId: product.id,
        meta: { status: "published", bulk: true },
      });
      return null;
    }
    if (kind === "unpublish" || kind === "archive") {
      const block = kind === "unpublish" ? unpublishBlock(product) : archiveBlock(product);
      if (block) return blocked(block);
      const status = kind === "unpublish" ? "in_review" : "archived";
      await updateStoreProduct(product.id, { status, unpublishedReason: null }, product);
      recordAudit({
        ...audit,
        category: "publishing",
        action: `product.${status}`,
        summary: status === "archived" ? `Archived “${product.name}”` : `Moved “${product.name}” to in review`,
        entityId: product.id,
        meta: { status, bulk: true },
      });
      return null;
    }
    if (action.kind === "visibility") {
      const block = visibilityBlock(product, action.visibility);
      if (block) return blocked(block);
      await updateStoreProduct(product.id, { visibility: action.visibility }, product);
      recordAudit({
        ...audit,
        category: "product_import",
        action: "product.updated",
        summary: `Set “${product.name}” to ${action.visibility === "hidden" ? "hidden" : "visible"} on the storefront`,
        entityId: product.id,
        meta: { visibility: action.visibility, bulk: true },
      });
      return null;
    }
    if (kind === "bracket") {
      const block = bracketBlock(product, bracket!.id);
      if (block) return blocked(block);
      const costs = costsFor({ ...product, taxBracketId: bracket!.id });
      await updateStoreProduct(product.id, { taxBracketId: bracket!.id, costs }, product);
      recordAudit({
        ...audit,
        category: "pricing",
        action: "product.updated",
        summary: `Changed the tax bracket on “${product.name}” to ${bracket!.name}`,
        entityId: product.id,
        meta: { taxBracketId: bracket!.id, marginPct: costs.marginPct, bulk: true },
      });
      return null;
    }
    // Price.
    const from = action.kind === "price" ? action.from?.[product.id] : undefined;
    // A price the preview never saw is left alone.
    if (from !== product.price) return t("blocked.priceChanged");
    const next = { ...product, ...repriceProduct(product, change!) };
    const costs = costsFor(next);
    const block = priceBlock(next.variants, costs.marginAmount);
    if (block) return blocked(block);
    await updateStoreProduct(product.id, { price: next.price, variants: next.variants, costs }, product);
    recordAudit({
      ...audit,
      category: "pricing",
      action: "product.price_changed",
      summary: `Changed “${product.name}” from ${formatMoney(product.price, product.currency)} to ${formatMoney(next.price, product.currency)}`,
      entityId: product.id,
      meta: { from: product.price, to: next.price, marginPct: costs.marginPct, bulk: true },
    });
    return null;
  }

  // Five at a time keeps the database pool unhurried.
  for (let i = 0; i < products.length; i += 5) {
    await Promise.all(
      products.slice(i, i + 5).map(async (product) => {
        let reason: string | null;
        try {
          reason = await apply(product);
        } catch {
          reason = t("failedGeneric");
        }
        if (reason) outcome.failed.push({ id: product.id, name: product.name, reason });
        else outcome.succeeded.push({ id: product.id, name: product.name });
      }),
    );
  }

  if (outcome.succeeded.length > 0) {
    revalidatePath(`/app/stores/${storeId}/catalog`);
    for (const entry of outcome.succeeded) revalidatePath(`/app/stores/${storeId}/catalog/${entry.id}`);
    revalidatePath(`/s/${store.slug}`);
  }
  return outcome;
}

export async function deleteProduct(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const { user, store, product } = await loadProduct(storeId, productId);

  await db.deleteOne(COLLECTIONS.storeProducts, { id: productId });
  recordAudit({
    category: "administration",
    action: "product.deleted",
    summary: `Deleted “${product.name}” from the store catalog`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "store_product",
    entityId: productId,
    meta: {},
  });
  revalidatePath(`/app/stores/${storeId}/catalog`);
  redirect(`/app/stores/${storeId}/catalog`);
}

/** Void wrapper so the placement form can be a plain <form action={…}>. */
export async function persistPlacement(formData: FormData): Promise<void> {
  await saveArtworkPlacement({ status: "idle" }, formData);
}

"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  COLLECTIONS,
  getCatalogProduct,
  getStoreProduct,
  getTaxBracket,
  listStoreProducts,
  listTaxBrackets,
  recordAudit,
  updateStoreProduct,
} from "@/lib/data";
import { blockingIssues, validateArtwork } from "@/lib/artwork";
import { publishBlockersFor, type PublishBlocker } from "@/lib/publish-blockers";
import { readStoredImage } from "@/lib/uploads";
import { db } from "@/lib/mongo";
import { copyCatalogProductIntoStore } from "@/lib/catalog-import";
import { breakdownFor } from "@/lib/pricing";
import { isQuoteOnly } from "@/lib/sourcing";
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
import { assertStoreAccess } from "@/lib/session";
import type { Artwork, CatalogProduct, MockupImage, Store, StoreProduct } from "@/lib/types";
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
  const { user, store } = await assertStoreAccess(storeId, "store.catalog");
  const [existing, catalogProduct] = await Promise.all([listStoreProducts(storeId), getCatalogProduct(catalogId)]);

  // A resubmitted copy — double click, refresh, a tab left open — lands on the
  // record it already created instead of making a second one.
  const already = importKey ? existing.find((p) => p.importKey === importKey) : undefined;
  if (already) {
    const copies = existing.filter((p) => p.catalogProductId === already.catalogProductId).length;
    redirect(`/app/stores/${storeId}/catalog/${already.id}?imported=${copies > 1 ? "copy" : "1"}`);
  }

  // A bulk-sourcing listing has no unit cost to copy: the price is whatever a
  // supplier quoted this store for this run, and it comes in through the
  // accepted quote on the enquiry. From here the enquiry form opens instead.
  if (catalogProduct && isQuoteOnly(catalogProduct)) redirect(sourcingQuoteHref(storeId, catalogId, filters));

  // Copying in a supplier product the store already holds needs a decision
  // first — the alternative is two rows nobody can tell apart.
  if (!confirmed && existing.some((p) => p.catalogProductId === catalogId)) {
    redirect(sourcingConfirmHref(storeId, catalogId, filters));
  }

  const { product, copyNumber } = await copyCatalogProductIntoStore(store, catalogId, user, importKey);

  revalidatePath(`/app/stores/${storeId}/catalog`);
  redirect(`/app/stores/${storeId}/catalog/${product.id}?imported=${copyNumber > 1 ? "copy" : "1"}`);
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

async function recost(product: StoreProduct, store: Store, catalog: CatalogProduct | null) {
  const bracket = product.taxBracketId ? await getTaxBracket(product.taxBracketId) : null;
  return breakdownFor(product, catalog, bracket, store.pricesIncludeTax);
}

export async function saveProductDetails(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const { user, store, product, catalog } = await loadEditable(storeId, productId);

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const tags = String(formData.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12);
  const priceRaw = String(formData.get("price") ?? "");
  const taxBracketId = String(formData.get("taxBracketId") ?? "") || null;
  const visibility = formData.get("visibility") === "hidden" ? "hidden" : "public";
  const artworkUpload = formData.get("shopperArtwork") === "on";
  const textLine = formData.get("shopperText") === "on";
  const textLabel = String(formData.get("textLabel") ?? "Personalisation").trim() || "Personalisation";
  const maxTextLength = Math.max(4, Math.min(40, Number(formData.get("maxTextLength") ?? 18) || 18));

  const t = await getTranslations("actions.products");
  if (name.length < 3) return { status: "error", message: t("nameTooShort"), field: "name" };
  if (description.length < 20) {
    return { status: "error", message: t("descriptionTooShort"), field: "description" };
  }
  const price = parseMoney(priceRaw, product.currency);
  if (price === null || price <= 0) {
    return { status: "error", message: t("priceRequired"), field: "price" };
  }

  // Publishing already requires a bracket; clearing it afterwards would put a
  // live product back on sale with no tax collected, so block that too.
  if (!taxBracketId && (product.status === "published" || product.status === "in_review")) {
    return {
      status: "error",
      message: t("bracketRequired"),
      field: "taxBracketId",
    };
  }

  const priceChanged = price !== product.price;
  const next: StoreProduct = {
    ...product,
    name,
    description,
    tags,
    price,
    taxBracketId,
    visibility,
    shopperCustomization: { artworkUpload, textLine, textLabel, maxTextLength },
  };
  next.costs = await recost(next, store, catalog);

  await updateStoreProduct(
    productId,
    {
      name,
      description,
      tags,
      price,
      taxBracketId,
      visibility,
      shopperCustomization: next.shopperCustomization,
      costs: next.costs,
    },
    product,
  );

  if (priceChanged) {
    recordAudit({
      category: "pricing",
      action: "product.price_changed",
      summary: `Changed “${name}” from ${formatMoney(product.price, product.currency)} to ${formatMoney(price, product.currency)}`,
      storeId,
      agencyId: store.agencyId,
      actorId: user.id,
      actorName: user.name,
      entity: "store_product",
      entityId: productId,
      meta: { from: product.price, to: price, marginPct: next.costs.marginPct },
    });
  }
  recordAudit({
    category: "product_import",
    action: "product.updated",
    summary: `Updated product details for “${name}”`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "store_product",
    entityId: productId,
    meta: { visibility },
  });

  revalidatePath(`/app/stores/${storeId}/catalog/${productId}`);
  revalidatePath(`/s/${store.slug}`);
  return { status: "success", message: t("saved", { margin: next.costs.marginPct.toFixed(1) }) };
}

export async function saveVariants(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const { user, store, product, catalog } = await loadEditable(storeId, productId);

  const variants = product.variants.map((variant) => {
    const enabled = formData.get(`enabled_${variant.id}`) === "on";
    const raw = String(formData.get(`price_${variant.id}`) ?? "");
    const parsed = parseMoney(raw, product.currency);
    return { ...variant, enabled, price: parsed ?? variant.price };
  });

  const [t, locale] = await Promise.all([getTranslations("actions.products"), getLocale()]);
  if (!variants.some((v) => v.enabled)) {
    return { status: "error", message: t("variantRequired"), field: "variants" };
  }
  const bad = variants.find((v) => v.enabled && v.price <= v.baseCost);
  if (bad) {
    return {
      status: "error",
      message: t("belowCost", { name: bad.name, cost: formatMoney(bad.baseCost, product.currency, locale) }),
      field: `price_${bad.id}`,
    };
  }

  const next = { ...product, variants };
  const costs = await recost(next, store, catalog);
  await updateStoreProduct(productId, { variants, costs }, product);
  recordAudit({
    category: "pricing",
    action: "product.variants_updated",
    summary: `Updated variants and variant pricing on “${product.name}”`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "store_product",
    entityId: productId,
    meta: { enabled: variants.filter((v) => v.enabled).length },
  });
  revalidatePath(`/app/stores/${storeId}/catalog/${productId}`);
  return { status: "success", message: t("variantsSaved", { count: variants.filter((v) => v.enabled).length }) };
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
  const { user, store, product, catalog } = await loadEditable(storeId, productId);
  const t = await getTranslations("actions.products");
  if (!catalog) return { status: "error", message: t("supplierMissing") };

  const area = catalog.printAreas.find((a) => a.id === printAreaId);
  if (!area) return { status: "error", message: t("areaRequired") };

  const stored = readStoredImage(formData, "artwork", "artwork");
  if (!stored || !stored.pixelWidth || !stored.pixelHeight) {
    return { status: "error", message: t("fileRequired"), field: "artwork" };
  }
  if (stored.sizeBytes > catalog.fileRequirements.maxFileMb * 1024 * 1024) {
    return {
      status: "error",
      message: t("fileTooLarge", {
        size: (stored.sizeBytes / 1024 / 1024).toFixed(1),
        max: catalog.fileRequirements.maxFileMb,
      }),
      field: "artwork",
    };
  }

  const artwork: Artwork = {
    id: newId("art"),
    printAreaId: area.id,
    view: area.view,
    fileName: stored.fileName,
    url: stored.url,
    mimeType: stored.mimeType,
    sizeBytes: stored.sizeBytes,
    pixelWidth: stored.pixelWidth,
    pixelHeight: stored.pixelHeight,
    hasAlpha: stored.hasAlpha,
    x: 0.5,
    y: 0.5,
    scale: 0.6,
    rotation: 0,
  };

  const artworks = [...product.artworks.filter((a) => a.printAreaId !== area.id), artwork];
  const next = { ...product, artworks, mockups: [] as MockupImage[] };
  const costs = await recost(next, store, catalog);

  await updateStoreProduct(productId, { artworks, mockups: [], costs }, product);
  recordAudit({
    category: "product_import",
    action: "product.artwork_uploaded",
    summary: `Uploaded ${stored.fileName} to the ${area.name} print area of “${product.name}”`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "store_product",
    entityId: productId,
    meta: { printArea: area.name, pixels: `${stored.pixelWidth}x${stored.pixelHeight}` },
  });

  revalidateAfterArtworkChange(storeId, productId, store.slug);
  const issues = validateArtwork(artwork, area, catalog.fileRequirements);
  const errors = blockingIssues(issues);
  return {
    status: "success",
    message: errors.length
      ? t("uploadedIssues", { count: errors.length })
      : t("uploaded"),
  };
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
  const { user, store, product, catalog } = await loadEditable(storeId, productId);

  const removed = product.artworks.find((a) => a.id === artworkId);
  const artworks = product.artworks.filter((a) => a.id !== artworkId);
  const next = { ...product, artworks };
  const costs = await recost(next, store, catalog);

  await updateStoreProduct(productId, { artworks, mockups: [], costs }, product);
  recordAudit({
    category: "product_import",
    action: "product.artwork_removed",
    summary: `Removed ${removed?.fileName ?? "artwork"} from “${product.name}”`,
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

/**
 * Approving is a single field flipped on each preview, so it reads only what it
 * writes: the access check and the product in one wave, no catalog entry and no
 * cost breakdown, because approval changes neither. With the updated record
 * handed to the memo, the re-render that follows does not read anything at all.
 */
export async function approveMockups(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const { user, store, product } = await loadProduct(storeId, productId);
  if (product.mockups.length === 0) return;
  if (product.mockups.every((m) => m.approved)) return;

  const now = new Date().toISOString();
  const mockups = product.mockups.map((m) => ({
    ...m,
    approved: true,
    approvedBy: user.name,
    approvedAt: now,
  }));
  await updateStoreProduct(productId, { mockups }, product);
  recordAudit({
    category: "publishing",
    action: "product.mockups_approved",
    summary: `Approved ${mockups.length} mockup${mockups.length === 1 ? "" : "s"} for “${product.name}”`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "store_product",
    entityId: productId,
    meta: {},
  });
  revalidatePath(`/app/stores/${storeId}/catalog/${productId}`);
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
  const { user, store, product } = await loadProduct(storeId, productId);

  if (status === "published") {
    const blockers = await publishBlockers(productId);
    if (blockers.length > 0) return;
  }

  await updateStoreProduct(
    productId,
    {
      status,
      publishedAt: status === "published" ? new Date().toISOString() : product.publishedAt,
      unpublishedReason: null,
    },
    product,
  );
  recordAudit({
    category: "publishing",
    action: `product.${status}`,
    summary:
      status === "published"
        ? `Published “${product.name}” at ${formatMoney(product.price, product.currency)}`
        : status === "archived"
          ? `Archived “${product.name}”`
          : `Moved “${product.name}” to ${status.replace("_", " ")}`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "store_product",
    entityId: productId,
    meta: { status },
  });
  revalidatePath(`/app/stores/${storeId}/catalog`);
  revalidatePath(`/app/stores/${storeId}/catalog/${productId}`);
  revalidatePath(`/s/${store.slug}`);
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

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  COLLECTIONS,
  getCatalogProduct,
  getStoreProduct,
  getTaxBracket,
  recordAudit,
  updateStoreProduct,
} from "@/lib/data";
import { blockingIssues, validateArtwork } from "@/lib/artwork";
import { readStoredImage } from "@/lib/uploads";
import { db } from "@/lib/platform";
import { copyCatalogProductIntoStore } from "@/lib/catalog-import";
import { breakdownFor } from "@/lib/pricing";
import { assertStoreAccess } from "@/lib/session";
import type { Artwork, CatalogProduct, MockupImage, Store, StoreProduct } from "@/lib/types";
import { formatMoney, newId, parseMoney } from "@/lib/util";
import type { ActionState } from "./stores";

/* ------------------------------------------------------------------ import */

export async function importCatalogProduct(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const catalogId = String(formData.get("catalogId") ?? "");
  const { user, store } = await assertStoreAccess(storeId, "store.catalog");
  const product = await copyCatalogProductIntoStore(store, catalogId, user);

  revalidatePath(`/app/stores/${storeId}/catalog`);
  redirect(`/app/stores/${storeId}/catalog/${product.id}?imported=1`);
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

  if (name.length < 3) return { status: "error", message: "Give the product a name of at least 3 characters.", field: "name" };
  if (description.length < 20) {
    return { status: "error", message: "Write at least a sentence of description — shoppers see this on the product page.", field: "description" };
  }
  const price = parseMoney(priceRaw, product.currency);
  if (price === null || price <= 0) {
    return { status: "error", message: "Enter a selling price greater than zero.", field: "price" };
  }

  // Publishing already requires a bracket; clearing it afterwards would put a
  // live product back on sale with no tax collected, so block that too.
  if (!taxBracketId && (product.status === "published" || product.status === "in_review")) {
    return {
      status: "error",
      message: "Pick the tax bracket this product falls into — a live product cannot sell untaxed.",
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
  return { status: "success", message: `Saved. Margin is now ${next.costs.marginPct.toFixed(1)}%.` };
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

  if (!variants.some((v) => v.enabled)) {
    return { status: "error", message: "Keep at least one variant enabled, or the product cannot be bought.", field: "variants" };
  }
  const bad = variants.find((v) => v.enabled && v.price <= v.baseCost);
  if (bad) {
    return {
      status: "error",
      message: `“${bad.name}” is priced at or below its supplier cost of ${formatMoney(bad.baseCost, product.currency)}. Raise the price or disable the variant.`,
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
  return { status: "success", message: `${variants.filter((v) => v.enabled).length} variants enabled.` };
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
  if (!catalog) return { status: "error", message: "The supplier product behind this item is missing." };

  const area = catalog.printAreas.find((a) => a.id === printAreaId);
  if (!area) return { status: "error", message: "Choose a print area for the artwork." };

  const stored = readStoredImage(formData, "artwork", "artwork");
  if (!stored || !stored.pixelWidth || !stored.pixelHeight) {
    return { status: "error", message: "Choose an artwork file to upload.", field: "artwork" };
  }
  if (stored.sizeBytes > catalog.fileRequirements.maxFileMb * 1024 * 1024) {
    return {
      status: "error",
      message: `That file is ${(stored.sizeBytes / 1024 / 1024).toFixed(1)} MB. ${catalog.name} accepts up to ${catalog.fileRequirements.maxFileMb} MB.`,
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

  revalidatePath(`/app/stores/${storeId}/catalog/${productId}`);
  const issues = validateArtwork(artwork, area, catalog.fileRequirements);
  const errors = blockingIssues(issues);
  return {
    status: "success",
    message: errors.length
      ? `Uploaded. ${errors.length} issue${errors.length === 1 ? "" : "s"} must be corrected before approval — see the checks below.`
      : "Uploaded and placed in the centre of the print area. Adjust the position, then generate mockups.",
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
  const { product } = await loadProduct(storeId, productId);

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
  if (!moved) return { status: "success", message: "Placement saved." };

  await updateStoreProduct(productId, { artworks, mockups: [] }, product);
  revalidatePath(`/app/stores/${storeId}/catalog/${productId}`);
  return { status: "success", message: "Placement saved. Generate mockups to preview the result." };
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
  revalidatePath(`/app/stores/${storeId}/catalog/${productId}`);
}

/* --------------------------------------------------------------- mockups */

export async function generateMockups(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const { user, store, product, catalog } = await loadEditable(storeId, productId);
  if (!catalog) return { status: "error", message: "The supplier product behind this item is missing." };
  if (product.artworks.length === 0) {
    return { status: "error", message: "Add artwork to at least one print area before generating mockups." };
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

    mockups.push({
      id: newId("mck"),
      view: area.view,
      url: rendered.url,
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
      message:
        "No preview could be rendered. Check that each print area with artwork has supplier photography, then try again.",
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
  revalidatePath(`/app/stores/${storeId}/catalog/${productId}`);
  return {
    status: "success",
    message: `${mockups.length} preview${mockups.length === 1 ? "" : "s"} generated. Review them and approve before publishing.`,
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

  const patch = {
    mockups: [] as MockupImage[],
    status: product.status === "published" ? ("in_review" as const) : product.status,
  };
  await updateStoreProduct(productId, patch, product);
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
  revalidatePath(`/app/stores/${storeId}/catalog/${productId}`);
}

/* -------------------------------------------------------------- publishing */

export interface PublishBlocker {
  reason: string;
  fix: string;
}

/** Everything that must be true before a product can go live. */
export async function publishBlockers(productId: string): Promise<PublishBlocker[]> {
  const product = await getStoreProduct(productId);
  if (!product) return [{ reason: "Product not found.", fix: "Reload the page." }];
  const catalog = await getCatalogProduct(product.catalogProductId);
  const blockers: PublishBlocker[] = [];

  if (!catalog) {
    blockers.push({
      reason: "The supplier product behind this item has been retired.",
      fix: "Import a replacement from the shared catalog.",
    });
    return blockers;
  }
  if (product.artworks.length === 0) {
    blockers.push({
      reason: "No artwork has been placed.",
      fix: "Upload a logo or design into at least one print area.",
    });
  }
  for (const artwork of product.artworks) {
    const area = catalog.printAreas.find((a) => a.id === artwork.printAreaId);
    if (!area) continue;
    for (const issue of blockingIssues(validateArtwork(artwork, area, catalog.fileRequirements))) {
      blockers.push({ reason: `${area.name}: ${issue.message}`, fix: issue.fix });
    }
  }
  if (product.mockups.length === 0) {
    blockers.push({
      reason: "No mockups have been generated.",
      fix: "Generate previews so the placement can be checked before production.",
    });
  } else if (product.mockups.some((m) => !m.approved)) {
    blockers.push({
      reason: "The generated mockups have not been approved.",
      fix: "Review each preview and approve them.",
    });
  }
  if (!product.taxBracketId) {
    blockers.push({
      reason: "No tax bracket is selected.",
      fix: "Pick the bracket this product falls into so tax is calculated at checkout.",
    });
  }
  if (product.costs.marginAmount <= 0) {
    blockers.push({
      reason: `The margin is ${formatMoney(product.costs.marginAmount, product.currency)} — this product would sell at a loss.`,
      fix: "Raise the selling price or choose a cheaper supplier product.",
    });
  }
  if (!product.variants.some((v) => v.enabled)) {
    blockers.push({ reason: "Every variant is disabled.", fix: "Enable at least one size or colour." });
  }
  return blockers;
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
    { status, publishedAt: status === "published" ? new Date().toISOString() : product.publishedAt },
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

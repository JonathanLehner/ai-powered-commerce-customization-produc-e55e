import "server-only";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { blockingIssues, validateArtwork } from "../artwork";
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
} from "../bulk-products";
import { copyCatalogProductIntoStore } from "../catalog-import";
import {
  COLLECTIONS,
  getCatalogProduct,
  getStoreProduct,
  getTaxBracket,
  listStoreProducts,
  listTaxBrackets,
  recordAudit,
  updateStoreProduct,
} from "../data";
import { db } from "../mongo";
import { breakdownFor } from "../pricing";
import { publishBlockersFor, type PublishBlocker } from "../publish-blockers";
import type { Locale } from "@/i18n/locales";
import { storeSku } from "../sku";
import { isQuoteOnly } from "../sourcing";
import type { Artwork, CatalogProduct, MockupImage, Store, StoreProduct, StoredImage } from "../types";
import { formatMoney, newId } from "../util";
import { OperationError, type OperationContext } from "./context";

/**
 * A store's products: copying one in from the shared catalog, its details,
 * variants, artwork, preview approval and status. The workspace's product
 * actions and the Admin API's product endpoints both run these.
 */

/** The product, provided it belongs to the context's store. */
export async function findProduct(storeId: string, productId: string): Promise<StoreProduct | null> {
  const product = await getStoreProduct(productId);
  return product && product.storeId === storeId ? product : null;
}

async function recost(product: StoreProduct, store: Store, catalog: CatalogProduct | null) {
  const bracket = product.taxBracketId ? await getTaxBracket(product.taxBracketId) : null;
  return breakdownFor(product, catalog, bracket, store.pricesIncludeTax);
}

function audit(ctx: OperationContext, input: Omit<Parameters<typeof recordAudit>[0], "storeId" | "agencyId" | "actorId" | "actorName" | "entity">) {
  recordAudit({
    ...input,
    storeId: ctx.store.id,
    agencyId: ctx.store.agencyId,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "store_product",
  });
}

/**
 * Artwork and mockup edits can take a published product off the storefront (see
 * `updateStoreProduct`), so the shop pages are revalidated alongside the editor.
 */
function revalidateAfterArtworkChange(store: Store, productId: string) {
  revalidatePath(`/app/stores/${store.id}/catalog`);
  revalidatePath(`/app/stores/${store.id}/catalog/${productId}`);
  revalidatePath(`/s/${store.slug}`);
}

/* ------------------------------------------------------------------ import */

export type ImportOutcome =
  /** The same import key already made this product. */
  | { kind: "existing"; product: StoreProduct; copies: number }
  /** A bulk-sourcing listing: priced by quote, so it comes in through an enquiry. */
  | { kind: "quote_only" }
  /** The store already holds this supplier product and the caller has not said to copy it again. */
  | { kind: "needs_confirmation" }
  | { kind: "created"; product: StoreProduct; copyNumber: number };

export async function importProduct(
  ctx: OperationContext,
  input: { catalogId: string; importKey: string | null; confirmed: boolean },
): Promise<ImportOutcome> {
  const [existing, catalogProduct] = await Promise.all([
    listStoreProducts(ctx.store.id),
    getCatalogProduct(input.catalogId),
  ]);

  // A resubmitted copy (double click, refresh, a tab left open) lands on the
  // record it already created instead of making a second one.
  const already = input.importKey ? existing.find((p) => p.importKey === input.importKey) : undefined;
  if (already) {
    const copies = existing.filter((p) => p.catalogProductId === already.catalogProductId).length;
    return { kind: "existing", product: already, copies };
  }

  // A bulk-sourcing listing has no unit cost to copy: the price is whatever a
  // supplier quoted this store for this run, and it comes in through the
  // accepted quote on the enquiry.
  if (catalogProduct && isQuoteOnly(catalogProduct)) return { kind: "quote_only" };
  if (!catalogProduct) throw new OperationError("not_found", "That catalog product no longer exists.", "catalogProductId");

  // Copying in a supplier product the store already holds needs a decision
  // first; the alternative is two rows nobody can tell apart.
  if (!input.confirmed && existing.some((p) => p.catalogProductId === input.catalogId)) {
    return { kind: "needs_confirmation" };
  }

  const { product, copyNumber } = await copyCatalogProductIntoStore(ctx.store, input.catalogId, ctx.actor, input.importKey);
  revalidatePath(`/app/stores/${ctx.store.id}/catalog`);
  return { kind: "created", product, copyNumber };
}

/* --------------------------------------------------------------- details */

export interface ProductDetailsInput {
  name: string;
  description: string;
  tags: string[];
  /** Minor units; null when what was entered is not an amount. */
  price: number | null;
  taxBracketId: string | null;
  visibility: StoreProduct["visibility"];
  shopperCustomization: StoreProduct["shopperCustomization"];
  /** Only the API sets a SKU; the workspace leaves it as imported. */
  sku?: string;
}

export async function saveProductDetails(
  ctx: OperationContext,
  product: StoreProduct,
  input: ProductDetailsInput,
): Promise<StoreProduct> {
  const { store } = ctx;
  const name = input.name.trim();
  const description = input.description.trim();
  const tags = input.tags
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12);
  const price = input.price;
  const taxBracketId = input.taxBracketId || null;
  const visibility = input.visibility === "hidden" ? "hidden" : "public";
  const textLabel = input.shopperCustomization.textLabel.trim() || "Personalisation";
  const maxTextLength = Math.max(4, Math.min(40, Number(input.shopperCustomization.maxTextLength) || 18));
  const shopperCustomization = {
    artworkUpload: input.shopperCustomization.artworkUpload,
    textLine: input.shopperCustomization.textLine,
    textLabel,
    maxTextLength,
  };

  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.products" });
  if (name.length < 3) throw new OperationError("invalid", t("nameTooShort"), "name");
  if (description.length < 20) throw new OperationError("invalid", t("descriptionTooShort"), "description");
  if (price === null || !Number.isFinite(price) || price <= 0) {
    throw new OperationError("invalid", t("priceRequired"), "price");
  }

  // Publishing already requires a bracket; clearing it afterwards would put a
  // live product back on sale with no tax collected, so block that too.
  if (!taxBracketId && (product.status === "published" || product.status === "in_review")) {
    throw new OperationError("invalid", t("bracketRequired"), "taxBracketId");
  }

  let sku = product.sku;
  if (input.sku !== undefined && input.sku !== storeSku(product, store.channelCode)) {
    sku = input.sku.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9-]{1,39}$/.test(sku)) {
      throw new OperationError("invalid", "A SKU is 2 to 40 letters, digits and hyphens.", "sku");
    }
    const others = (await listStoreProducts(store.id)).filter((p) => p.id !== product.id);
    if (others.some((p) => storeSku(p, store.channelCode).toUpperCase() === sku)) {
      throw new OperationError("conflict", `Another product in this store already uses the SKU ${sku}.`, "sku");
    }
  }

  const catalog = await getCatalogProduct(product.catalogProductId);
  const priceChanged = price !== product.price;
  const next: StoreProduct = {
    ...product,
    name,
    description,
    tags,
    price,
    taxBracketId,
    visibility,
    sku,
    shopperCustomization,
  };
  next.costs = await recost(next, store, catalog);

  await updateStoreProduct(
    product.id,
    {
      name,
      description,
      tags,
      price,
      taxBracketId,
      visibility,
      shopperCustomization,
      costs: next.costs,
      ...(sku !== product.sku ? { sku } : {}),
    },
    product,
  );

  if (priceChanged) {
    audit(ctx, {
      category: "pricing",
      action: "product.price_changed",
      summary: `Changed “${name}” from ${formatMoney(product.price, product.currency)} to ${formatMoney(price, product.currency)}`,
      entityId: product.id,
      meta: { from: product.price, to: price, marginPct: next.costs.marginPct },
    });
  }
  audit(ctx, {
    category: "product_import",
    action: "product.updated",
    summary: `Updated product details for “${name}”`,
    entityId: product.id,
    meta: sku !== product.sku ? { visibility, sku: sku ?? null } : { visibility },
  });

  revalidatePath(`/app/stores/${store.id}/catalog/${product.id}`);
  revalidatePath(`/s/${store.slug}`);
  return next;
}

/* ---------------------------------------------------------------- variants */

export interface VariantChange {
  enabled?: boolean;
  /** Minor units. */
  price?: number;
  /** Shipping weight in grams. */
  weightGrams?: number;
}

/**
 * Applies changes to some or all of a product's variants. At least one variant
 * stays on sale, and none is priced at or below what it costs.
 */
export async function saveVariants(
  ctx: OperationContext,
  product: StoreProduct,
  changes: Record<string, VariantChange>,
): Promise<StoreProduct> {
  const variants = product.variants.map((variant) => {
    const change = changes[variant.id];
    if (!change) return variant;
    return {
      ...variant,
      enabled: change.enabled ?? variant.enabled,
      price: change.price ?? variant.price,
      ...(change.weightGrams !== undefined ? { weightGrams: change.weightGrams } : {}),
    };
  });

  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.products" });
  const heavy = variants.find(
    (v) => v.weightGrams !== undefined && (!Number.isInteger(v.weightGrams) || v.weightGrams < 0 || v.weightGrams > 1_000_000),
  );
  if (heavy) {
    throw new OperationError("invalid", t("weightRange", { name: heavy.name }), `weight_${heavy.id}`);
  }
  if (!variants.some((v) => v.enabled)) {
    throw new OperationError("invalid", t("variantRequired"), "variants");
  }
  const bad = variants.find((v) => v.enabled && v.price <= v.baseCost);
  if (bad) {
    throw new OperationError(
      "invalid",
      t("belowCost", { name: bad.name, cost: formatMoney(bad.baseCost, product.currency, ctx.locale) }),
      `price_${bad.id}`,
    );
  }

  const catalog = await getCatalogProduct(product.catalogProductId);
  const next = { ...product, variants };
  const costs = await recost(next, ctx.store, catalog);
  await updateStoreProduct(product.id, { variants, costs }, product);
  audit(ctx, {
    category: "pricing",
    action: "product.variants_updated",
    summary: `Updated variants and variant pricing on “${product.name}”`,
    entityId: product.id,
    meta: { enabled: variants.filter((v) => v.enabled).length },
  });
  revalidatePath(`/app/stores/${ctx.store.id}/catalog/${product.id}`);
  return { ...next, costs };
}

/**
 * Adds a variant of the supplier product that the store's copy does not carry,
 * such as a colour the supplier introduced after the product was copied in.
 */
export async function addCatalogVariant(
  ctx: OperationContext,
  product: StoreProduct,
  input: { catalogVariantId: string; price?: number },
): Promise<StoreProduct> {
  const catalog = await getCatalogProduct(product.catalogProductId);
  const source = catalog?.variants.find((v) => v.id === input.catalogVariantId);
  if (!source) {
    throw new OperationError("not_found", "The supplier product has no variant with that id.", "catalogVariantId");
  }
  if (product.variants.some((v) => v.catalogVariantId === source.id)) {
    throw new OperationError("conflict", `“${product.name}” already has the ${source.name} variant.`, "catalogVariantId");
  }
  const baseCost = product.manualFulfilment?.unitCost ?? source.baseCost;
  const price = input.price ?? Math.round(baseCost * 2.6);
  if (!Number.isInteger(price) || price <= baseCost) {
    const t = await getTranslations({ locale: ctx.locale, namespace: "actions.products" });
    throw new OperationError(
      "invalid",
      t("belowCost", { name: source.name, cost: formatMoney(baseCost, product.currency, ctx.locale) }),
      "price",
    );
  }

  const variants = [
    ...product.variants,
    {
      id: newId("svar"),
      catalogVariantId: source.id,
      name: source.name,
      colour: source.colour,
      colourHex: source.colourHex,
      size: source.size,
      sku: `${ctx.store.channelCode.slice(0, 6).toUpperCase()}-${source.sku}`,
      baseCost,
      price,
      enabled: true,
      availability: source.availability,
    },
  ];
  const next = { ...product, variants };
  const costs = await recost(next, ctx.store, catalog);
  await updateStoreProduct(product.id, { variants, costs }, product);
  audit(ctx, {
    category: "pricing",
    action: "product.variant_added",
    summary: `Added the ${source.name} variant to “${product.name}” at ${formatMoney(price, product.currency)}`,
    entityId: product.id,
    meta: { catalogVariantId: source.id, price },
  });
  revalidatePath(`/app/stores/${ctx.store.id}/catalog/${product.id}`);
  return { ...next, costs };
}

/* ----------------------------------------------------------------- artwork */

/**
 * Places an already-stored image in one of the supplier's print areas,
 * replacing whatever was there. Returns the artwork and how many problems
 * would stop the product being published.
 */
export async function attachArtwork(
  ctx: OperationContext,
  product: StoreProduct,
  printAreaId: string,
  stored: StoredImage | null,
): Promise<{ artwork: Artwork; blockingIssues: number }> {
  const catalog = await getCatalogProduct(product.catalogProductId);
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.products" });
  if (!catalog) throw new OperationError("conflict", t("supplierMissing"));

  const area = catalog.printAreas.find((a) => a.id === printAreaId);
  if (!area) throw new OperationError("invalid", t("areaRequired"), "printAreaId");

  if (!stored || !stored.pixelWidth || !stored.pixelHeight) {
    throw new OperationError("invalid", t("fileRequired"), "artwork");
  }
  if (stored.sizeBytes > catalog.fileRequirements.maxFileMb * 1024 * 1024) {
    throw new OperationError(
      "invalid",
      t("fileTooLarge", {
        size: (stored.sizeBytes / 1024 / 1024).toFixed(1),
        max: catalog.fileRequirements.maxFileMb,
      }),
      "artwork",
    );
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
  const costs = await recost(next, ctx.store, catalog);

  await updateStoreProduct(product.id, { artworks, mockups: [], costs }, product);
  audit(ctx, {
    category: "product_import",
    action: "product.artwork_uploaded",
    summary: `Uploaded ${stored.fileName} to the ${area.name} print area of “${product.name}”`,
    entityId: product.id,
    meta: { printArea: area.name, pixels: `${stored.pixelWidth}x${stored.pixelHeight}` },
  });

  revalidateAfterArtworkChange(ctx.store, product.id);
  return { artwork, blockingIssues: blockingIssues(validateArtwork(artwork, area, catalog.fileRequirements)).length };
}

export async function removeArtwork(ctx: OperationContext, product: StoreProduct, artworkId: string): Promise<void> {
  const removed = product.artworks.find((a) => a.id === artworkId);
  const artworks = product.artworks.filter((a) => a.id !== artworkId);
  const catalog = await getCatalogProduct(product.catalogProductId);
  const costs = await recost({ ...product, artworks }, ctx.store, catalog);

  await updateStoreProduct(product.id, { artworks, mockups: [], costs }, product);
  audit(ctx, {
    category: "product_import",
    action: "product.artwork_removed",
    summary: `Removed ${removed?.fileName ?? "artwork"} from “${product.name}”`,
    entityId: product.id,
    meta: {},
  });
  revalidateAfterArtworkChange(ctx.store, product.id);
}

/* ----------------------------------------------------------------- mockups */

/**
 * Approving is a single field flipped on each preview, so it reads only what it
 * writes. Nothing to approve, or nothing left unapproved, writes nothing.
 */
export async function approveMockups(ctx: OperationContext, product: StoreProduct): Promise<StoreProduct> {
  if (product.mockups.length === 0 || product.mockups.every((m) => m.approved)) return product;

  const now = new Date().toISOString();
  const mockups = product.mockups.map((m) => ({
    ...m,
    approved: true,
    approvedBy: ctx.actor.name,
    approvedAt: now,
  }));
  await updateStoreProduct(product.id, { mockups }, product);
  audit(ctx, {
    category: "publishing",
    action: "product.mockups_approved",
    summary: `Approved ${mockups.length} mockup${mockups.length === 1 ? "" : "s"} for “${product.name}”`,
    entityId: product.id,
    meta: {},
  });
  revalidatePath(`/app/stores/${ctx.store.id}/catalog/${product.id}`);
  return { ...product, mockups };
}

/* -------------------------------------------------------------- publishing */

/**
 * Moves a product to a status. Publishing runs the same checks as the product
 * page's Publish button and, when anything stands in the way, returns the
 * blockers and writes nothing.
 */
export async function setProductStatus(
  ctx: OperationContext,
  product: StoreProduct,
  status: StoreProduct["status"],
): Promise<{ blockers: PublishBlocker[] }> {
  if (status === "published") {
    const blockers = (await publishBlockersFor([product], ctx.locale)).get(product.id) ?? [];
    if (blockers.length > 0) return { blockers };
  }

  await updateStoreProduct(
    product.id,
    {
      status,
      publishedAt: status === "published" ? new Date().toISOString() : product.publishedAt,
      unpublishedReason: null,
    },
    product,
  );
  audit(ctx, {
    category: "publishing",
    action: `product.${status}`,
    summary:
      status === "published"
        ? `Published “${product.name}” at ${formatMoney(product.price, product.currency)}`
        : status === "archived"
          ? `Archived “${product.name}”`
          : `Moved “${product.name}” to ${status.replace("_", " ")}`,
    entityId: product.id,
    meta: { status },
  });
  revalidatePath(`/app/stores/${ctx.store.id}/catalog`);
  revalidatePath(`/app/stores/${ctx.store.id}/catalog/${product.id}`);
  revalidatePath(`/s/${ctx.store.slug}`);
  return { blockers: [] };
}

/** Everything that must be true before the product can go live, in `locale` or the request's language. */
export async function productPublishBlockers(product: StoreProduct, locale?: Locale): Promise<PublishBlocker[]> {
  return (await publishBlockersFor([product], locale)).get(product.id) ?? [];
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
  succeeded: { id: string; name: string }[];
  failed: { id: string; name: string; reason: string }[];
}

/**
 * Applies one action to the selected products of a store and reports each
 * one. Publishing runs the same checks as the product page's Publish button,
 * and every product gets its own audit entry. A request refused as a whole
 * (nothing selected, an unknown action or bracket, an unreadable price change)
 * throws.
 */
export async function bulkUpdateProducts(
  ctx: OperationContext,
  productIds: string[],
  action: BulkProductAction,
): Promise<BulkProductOutcome> {
  const { store } = ctx;
  const storeId = store.id;
  const t = await getTranslations({ locale: ctx.locale, namespace: "catalog.bulk" });
  const ids = parseProductIds(productIds);
  if (ids.length === 0) throw new OperationError("invalid", t("noneSelected"), "productIds");

  const kind = action?.kind;
  if (!["publish", "unpublish", "archive", "bracket", "visibility", "price"].includes(kind)) {
    throw new OperationError("invalid", t("failedGeneric"), "action");
  }
  const change = action.kind === "price" ? parsePriceChange(action.change) : null;
  if (action.kind === "price" && !change) throw new OperationError("invalid", t("price.invalid"), "change");
  const brackets = kind === "price" || kind === "bracket" ? await listTaxBrackets() : [];
  const bracket = action.kind === "bracket" ? brackets.find((b) => b.id === action.bracketId) : undefined;
  if (kind === "bracket" && !bracket) throw new OperationError("invalid", t("failedGeneric"), "bracketId");
  if (action.kind === "visibility" && action.visibility !== "public" && action.visibility !== "hidden") {
    throw new OperationError("invalid", t("failedGeneric"), "visibility");
  }

  const wanted = new Set(ids);
  const products = (await listStoreProducts(storeId)).filter((p) => wanted.has(p.id));
  const outcome: BulkProductOutcome = { succeeded: [], failed: [] };
  const found = new Set(products.map((p) => p.id));
  for (const id of ids) {
    if (!found.has(id)) outcome.failed.push({ id, name: id, reason: t("notFound") });
  }

  const blockers =
    kind === "publish" ? await publishBlockersFor(products.filter((p) => p.status !== "published"), ctx.locale) : null;
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
      audit(ctx, {
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
      audit(ctx, {
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
      audit(ctx, {
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
      audit(ctx, {
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
    audit(ctx, {
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

/* ------------------------------------------------------------------ delete */

/** Removes the product from the store catalog. */
export async function deleteProduct(ctx: OperationContext, product: StoreProduct): Promise<void> {
  await db.deleteOne(COLLECTIONS.storeProducts, { id: product.id });
  audit(ctx, {
    category: "administration",
    action: "product.deleted",
    summary: `Deleted “${product.name}” from the store catalog`,
    entityId: product.id,
    meta: {},
  });
  revalidatePath(`/app/stores/${ctx.store.id}/catalog`);
}

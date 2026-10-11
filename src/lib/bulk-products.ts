/**
 * Which of the selected products a bulk action on the Catalog page can touch,
 * and what a bulk price change does to each one.
 *
 * Pure, so the toolbar can say up front which products an action will skip and
 * show the margins a price change leaves, and the server action can refuse the
 * same products for the same reason. `npm run bulk-products-check` covers it
 * without a database.
 */
import { computeBreakdown } from "./pricing";
import type { CostBreakdown, StoreProduct, StoreVariant } from "./types";

/** The most products one bulk action takes. */
export const BULK_PRODUCT_LIMIT = 200;

export type PriceMode = "increase" | "decrease" | "set";

/**
 * A price change: raise or lower by `value` percent, or set every price to
 * `value` in minor units.
 */
export interface PriceChange {
  mode: PriceMode;
  value: number;
}

/** What the toolbar needs to know about a product. */
export type BulkProduct = Pick<
  StoreProduct,
  "id" | "name" | "status" | "visibility" | "taxBracketId" | "price" | "currency"
> & {
  variants: Pick<StoreVariant, "id" | "enabled" | "price" | "baseCost">[];
  costs: Pick<
    CostBreakdown,
    "supplierCost" | "customizationCost" | "shippingEstimate" | "taxRate" | "marginAmount" | "marginPct"
  >;
  /** Why it cannot be published yet; empty when it can. Only filled in for unpublished products. */
  publishBlockers: string[];
};

/** Why a product is skipped, as a key under `catalog.bulk.blocked`. */
export type ProductBlock =
  | "alreadyPublished"
  | "notPublished"
  | "alreadyArchived"
  | "alreadyBracket"
  | "alreadyVisibility"
  | "belowCost"
  | "notReady";

export function publishBlock(product: Pick<BulkProduct, "status" | "publishBlockers">): ProductBlock | null {
  if (product.status === "published") return "alreadyPublished";
  return product.publishBlockers.length > 0 ? "notReady" : null;
}

/** Unpublishing sends a live product back to review, as the card's own button does. */
export function unpublishBlock(product: Pick<BulkProduct, "status">): ProductBlock | null {
  return product.status === "published" ? null : "notPublished";
}

export function archiveBlock(product: Pick<BulkProduct, "status">): ProductBlock | null {
  return product.status === "archived" ? "alreadyArchived" : null;
}

export function bracketBlock(product: Pick<BulkProduct, "taxBracketId">, bracketId: string): ProductBlock | null {
  return product.taxBracketId === bracketId ? "alreadyBracket" : null;
}

export function visibilityBlock(
  product: Pick<BulkProduct, "visibility">,
  visibility: StoreProduct["visibility"],
): ProductBlock | null {
  return product.visibility === visibility ? "alreadyVisibility" : null;
}

/** A valid change, or null: a positive percentage under 100 to lower by, or a price above zero. */
export function parsePriceChange(value: unknown): PriceChange | null {
  if (!value || typeof value !== "object") return null;
  const { mode, value: amount } = value as Record<string, unknown>;
  if (mode !== "increase" && mode !== "decrease" && mode !== "set") return null;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return null;
  if (mode === "decrease" && amount >= 100) return null;
  if (mode !== "set" && amount > 1000) return null;
  if (mode === "set" && !Number.isInteger(amount)) return null;
  return { mode, value: amount };
}

/** One price after the change, in minor units. */
export function changePrice(price: number, change: PriceChange): number {
  if (change.mode === "set") return change.value;
  const factor = change.mode === "increase" ? 1 + change.value / 100 : 1 - change.value / 100;
  return Math.max(0, Math.round(price * factor));
}

/** The product's selling price and every variant price after the change. */
export function repriceProduct<T extends Pick<BulkProduct, "price" | "variants">>(
  product: T,
  change: PriceChange,
): { price: number; variants: T["variants"] } {
  return {
    price: changePrice(product.price, change),
    variants: product.variants.map((variant) => ({ ...variant, price: changePrice(variant.price, change) })),
  };
}

/**
 * The margin the new price leaves, from the product's current costs. The
 * server recosts against the supplier listing when it saves, which gives the
 * same figure unless the listing changed in between.
 */
export function previewPrice(product: BulkProduct, change: PriceChange, pricesIncludeTax: boolean) {
  const next = repriceProduct(product, change);
  const costs = computeBreakdown({
    supplierCost: product.costs.supplierCost,
    customizationCost: product.costs.customizationCost,
    shippingEstimate: product.costs.shippingEstimate,
    sellingPrice: next.price,
    taxRate: product.costs.taxRate,
    pricesIncludeTax,
    currency: product.currency,
    taxBracketId: product.taxBracketId,
  });
  return {
    price: next.price,
    marginAmount: costs.marginAmount,
    marginPct: costs.marginPct,
    block: priceBlock(next.variants, costs.marginAmount),
  };
}

/**
 * The variants form refuses an enabled variant at or below its supplier cost,
 * and a product that loses money cannot be published; a bulk change keeps both.
 */
export function priceBlock(
  variants: Pick<StoreVariant, "enabled" | "price" | "baseCost">[],
  marginAmount: number,
): ProductBlock | null {
  if (marginAmount <= 0) return "belowCost";
  return variants.some((variant) => variant.enabled && variant.price <= variant.baseCost) ? "belowCost" : null;
}

/** Product ids from a request: trimmed, de-duplicated and capped. */
export function parseProductIds(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [];
  const ids = raw.filter((id): id is string => typeof id === "string").map((id) => id.trim()).filter(Boolean);
  return [...new Set(ids)].slice(0, BULK_PRODUCT_LIMIT);
}

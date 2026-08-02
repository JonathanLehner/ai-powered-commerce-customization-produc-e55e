import type { CatalogProduct, CostBreakdown, StoreProduct, TaxBracket } from "./types";

export interface PricingInput {
  supplierCost: number;
  customizationCost: number;
  shippingEstimate: number;
  sellingPrice: number;
  taxRate: number;
  pricesIncludeTax: boolean;
  currency: string;
  taxBracketId: string | null;
}

/**
 * Landed-cost model. Margin is measured against net revenue (what the seller
 * keeps after tax), because sellers are the merchant of record and remit tax.
 */
export function computeBreakdown(input: PricingInput): CostBreakdown {
  const rate = input.taxRate / 100;
  const taxAmount = input.pricesIncludeTax
    ? Math.round(input.sellingPrice - input.sellingPrice / (1 + rate))
    : Math.round(input.sellingPrice * rate);
  const netRevenue = input.pricesIncludeTax ? input.sellingPrice - taxAmount : input.sellingPrice;
  const landedCost = input.supplierCost + input.customizationCost + input.shippingEstimate;
  const marginAmount = netRevenue - landedCost;
  const marginPct = netRevenue > 0 ? (marginAmount / netRevenue) * 100 : 0;

  return {
    supplierCost: input.supplierCost,
    customizationCost: input.customizationCost,
    shippingEstimate: input.shippingEstimate,
    taxBracketId: input.taxBracketId,
    taxRate: input.taxRate,
    taxAmount,
    sellingPrice: input.sellingPrice,
    marginAmount,
    marginPct: Number(marginPct.toFixed(2)),
    currency: input.currency,
  };
}

/** Number of print areas that currently carry artwork — drives customisation cost. */
export function decoratedAreaCount(product: Pick<StoreProduct, "artworks">): number {
  return new Set(product.artworks.map((a) => a.printAreaId)).size;
}

export function breakdownFor(
  product: StoreProduct,
  catalog: CatalogProduct | null,
  bracket: TaxBracket | null,
  pricesIncludeTax: boolean,
): CostBreakdown {
  const enabled = product.variants.filter((v) => v.enabled);
  const supplierCost = enabled.length
    ? Math.min(...enabled.map((v) => v.baseCost))
    : product.variants[0]?.baseCost ?? 0;
  const perArea = catalog?.customizationCostPerArea ?? 0;
  const customizationCost = perArea * decoratedAreaCount(product);
  return computeBreakdown({
    supplierCost,
    customizationCost,
    shippingEstimate: catalog?.shippingEstimate ?? product.costs.shippingEstimate,
    sellingPrice: product.price,
    taxRate: bracket?.rate ?? 0,
    pricesIncludeTax,
    currency: product.currency,
    taxBracketId: bracket?.id ?? null,
  });
}

export function marginTone(pct: number): "healthy" | "thin" | "negative" {
  if (pct < 0) return "negative";
  if (pct < 25) return "thin";
  return "healthy";
}

/** Naive FX for storefronts that sell in more than one currency. */
const FX_TO_USD: Record<string, number> = {
  USD: 1, EUR: 1.08, GBP: 1.27, CAD: 0.73, AUD: 0.66, JPY: 0.0064, SGD: 0.74,
  CHF: 1.12, SEK: 0.095, AED: 0.27, BRL: 0.18, INR: 0.012, MXN: 0.055, ZAR: 0.054,
};

export function convert(minor: number, from: string, to: string): number {
  if (from === to) return minor;
  const fromRate = FX_TO_USD[from.toUpperCase()] ?? 1;
  const toRate = FX_TO_USD[to.toUpperCase()] ?? 1;
  const fromDecimals = from.toUpperCase() === "JPY" ? 0 : 2;
  const toDecimals = to.toUpperCase() === "JPY" ? 0 : 2;
  const major = minor / 10 ** fromDecimals;
  const converted = (major * fromRate) / toRate;
  return Math.round(converted * 10 ** toDecimals);
}

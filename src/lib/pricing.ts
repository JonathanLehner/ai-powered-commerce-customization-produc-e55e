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

export interface TaxRow {
  rate: number;
  amount: number;
}

/**
 * Tax is worked out line by line from each product's own bracket and the
 * amounts are added together, so a basket mixing brackets is charged correctly
 * instead of falling back to a single rate. Lines that share a rate are
 * reported as one row. Shipping is spread across the lines in proportion to
 * their value, so it is taxed at the same blend as the goods it carries.
 */
export function taxRowsFor(
  lines: { amount: number; rate: number }[],
  shipping: number,
  pricesIncludeTax: boolean,
): TaxRow[] {
  const byRate = new Map<number, number>();
  for (const line of lines) byRate.set(line.rate, (byRate.get(line.rate) ?? 0) + line.amount);
  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
  // Tax-inclusive pricing has always left shipping out of the tax base; keep that.
  const shippable = pricesIncludeTax ? 0 : shipping;

  let cumulative = 0;
  let allocated = 0;
  return [...byRate.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([rate, base]) => {
      cumulative += base;
      // Round the running total rather than each share, so the shares always
      // add back up to the shipping charge with no stray penny.
      const share = subtotal > 0 ? Math.round((shippable * cumulative) / subtotal) - allocated : 0;
      allocated += share;
      const taxable = base + share;
      const amount = pricesIncludeTax
        ? Math.round(taxable - taxable / (1 + rate / 100))
        : Math.round((taxable * rate) / 100);
      return { rate, amount };
    });
}

/** Tax rows to show for a placed order, falling back to pre-breakdown orders. */
export function orderTaxRows(order: { taxLines?: TaxRow[]; taxRate: number; taxAmount: number }): TaxRow[] {
  return order.taxLines?.length ? order.taxLines : [{ rate: order.taxRate, amount: order.taxAmount }];
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

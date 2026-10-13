import { attentionBreakdown, type AttentionBreakdown } from "./attention";
import { SETUP_STEPS, type Order, type StoreProduct, type StoreSetupState } from "./types";

export interface StoreMetrics {
  orderCount: number;
  paidOrders: number;
  grossSales: number;
  currency: string;
  inProduction: number;
  shipped: number;
  delivered: number;
  cancelled: number;
  exceptions: number;
  manualRouting: number;
  awaitingAction: number;
  /** `awaitingAction` split by reason; the parts add up to it. */
  attention: AttentionBreakdown;
  refunded: number;
  publishedProducts: number;
  draftProducts: number;
  last30Sales: number;
  last30Orders: number;
  topProducts: { name: string; units: number; revenue: number }[];
}

const REVENUE_STATUSES = new Set(["paid", "in_production", "shipped", "delivered"]);

/**
 * All figures are scoped to a single store. Nothing here merges customers or
 * carts across stores — the agency dashboard stacks per-store rows instead.
 */
export function storeMetrics(orders: Order[], products: StoreProduct[], currency: string): StoreMetrics {
  const cutoff = Date.now() - 30 * 86400000;
  let grossSales = 0;
  let last30Sales = 0;
  let last30Orders = 0;
  let refunded = 0;
  const productTotals = new Map<string, { name: string; units: number; revenue: number }>();

  for (const order of orders) {
    const counts = REVENUE_STATUSES.has(order.status);
    if (counts) grossSales += order.total;
    if (counts && new Date(order.createdAt).getTime() >= cutoff) {
      last30Sales += order.total;
      last30Orders += 1;
    }
    for (const refund of order.refunds) refunded += refund.amount;
    if (!counts) continue;
    for (const item of order.items) {
      const entry = productTotals.get(item.storeProductId) ?? {
        name: item.productName,
        units: 0,
        revenue: 0,
      };
      entry.units += item.quantity;
      entry.revenue += item.unitPrice * item.quantity;
      productTotals.set(item.storeProductId, entry);
    }
  }

  const count = (status: string) => orders.filter((o) => o.status === status).length;
  const attention = attentionBreakdown(orders);

  return {
    orderCount: orders.length,
    paidOrders: orders.filter((o) => REVENUE_STATUSES.has(o.status)).length,
    grossSales,
    currency,
    inProduction: count("in_production") + count("paid"),
    shipped: count("shipped"),
    delivered: count("delivered"),
    cancelled: count("cancelled"),
    exceptions: count("exception"),
    manualRouting: orders.filter((o) => o.fulfillment.routing === "manual_required").length,
    awaitingAction: attention.total,
    attention,
    refunded,
    publishedProducts: products.filter((p) => p.status === "published").length,
    draftProducts: products.filter((p) => p.status === "draft" || p.status === "in_review").length,
    last30Sales,
    last30Orders,
    topProducts: [...productTotals.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
  };
}

/**
 * Counted against `SETUP_STEPS`, not the keys the record carries: a store saved
 * before a step existed is missing that key, and counting only what is stored
 * would report it as fully set up.
 */
export function setupProgress(setup: Partial<StoreSetupState>): { done: number; total: number; pct: number } {
  const done = SETUP_STEPS.filter((step) => setup[step]).length;
  return { done, total: SETUP_STEPS.length, pct: (done / SETUP_STEPS.length) * 100 };
}

/** The steps a store cannot take orders without. The rest are optional. */
export const SELLING_STEPS = ["payments", "shipping"] as const;

type SellingStep = (typeof SELLING_STEPS)[number];
const isSellingStep = (step: string): step is SellingStep => (SELLING_STEPS as readonly string[]).includes(step);

/** Unfinished steps, split into what blocks selling and what is optional. */
export function setupRemaining(setup: Partial<StoreSetupState>) {
  const missing = SETUP_STEPS.filter((step) => !setup[step]);
  return {
    toSell: missing.filter(isSellingStep),
    optional: missing.filter((step): step is Exclude<typeof step, SellingStep> => !isSellingStep(step)),
  };
}

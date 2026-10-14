import { attentionBreakdown, type AttentionBreakdown } from "./attention";
import { SETUP_STEPS, type Order, type SetupStep, type StoreProduct, type StoreSetupState } from "./types";

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
  topProducts: { name: string; units: number; revenue: number }[];
}

const REVENUE_STATUSES = new Set(["paid", "in_production", "shipped", "delivered"]);

/**
 * All figures are scoped to a single store. Nothing here merges customers or
 * carts across stores — the agency dashboard stacks per-store rows instead.
 */
export function storeMetrics(orders: Order[], products: StoreProduct[], currency: string): StoreMetrics {
  let grossSales = 0;
  let refunded = 0;
  const productTotals = new Map<string, { name: string; units: number; revenue: number }>();

  for (const order of orders) {
    const counts = REVENUE_STATUSES.has(order.status);
    if (counts) grossSales += order.total;
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
    topProducts: [...productTotals.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
  };
}

/* ------------------------------------------------- the same, added up in MongoDB */

/** Every `StoreMetrics` figure that comes from the store's orders. */
export type OrderMetrics = Omit<StoreMetrics, "currency" | "publishedProducts" | "draftProducts" | "topProducts">;

const count = (condition: unknown) => ({ $sum: { $cond: [condition, 1, 0] } });
const statusIs = (status: string) => ({ $eq: ["$status", status] });
const statusIn = (statuses: string[]) => ({ $in: ["$status", statuses] });
const REVENUE = [...REVENUE_STATUSES];
const MANUAL = { $eq: ["$fulfillment.routing", "manual_required"] };
const EXCEPTION = statusIs("exception");

/**
 * `storeMetrics`' order figures for each store, grouped in the database. The
 * attention reasons follow `attentionReason`: an exception first, then manual
 * routing, then a paid order still waiting for production.
 */
export function orderMetricsPipeline(storeIds: string[]) {
  return [
    { $match: { storeId: { $in: storeIds } } },
    {
      $group: {
        _id: "$storeId",
        orderCount: { $sum: 1 },
        paidOrders: count(statusIn(REVENUE)),
        grossSales: { $sum: { $cond: [statusIn(REVENUE), "$total", 0] } },
        inProduction: count(statusIn(["in_production", "paid"])),
        shipped: count(statusIs("shipped")),
        delivered: count(statusIs("delivered")),
        cancelled: count(statusIs("cancelled")),
        exceptions: count(EXCEPTION),
        manualRouting: count(MANUAL),
        attentionException: count(EXCEPTION),
        attentionManual: count({ $and: [{ $not: [EXCEPTION] }, MANUAL] }),
        attentionAwaiting: count({ $and: [{ $not: [EXCEPTION] }, { $not: [MANUAL] }, statusIs("paid")] }),
        refunded: { $sum: { $sum: "$refunds.amount" } },
      },
    },
  ];
}

export interface OrderMetricsRow {
  _id: string;
  orderCount: number;
  paidOrders: number;
  grossSales: number;
  inProduction: number;
  shipped: number;
  delivered: number;
  cancelled: number;
  exceptions: number;
  manualRouting: number;
  attentionException: number;
  attentionManual: number;
  attentionAwaiting: number;
  refunded: number;
}

const NO_ORDERS: Omit<OrderMetricsRow, "_id"> = {
  orderCount: 0,
  paidOrders: 0,
  grossSales: 0,
  inProduction: 0,
  shipped: 0,
  delivered: 0,
  cancelled: 0,
  exceptions: 0,
  manualRouting: 0,
  attentionException: 0,
  attentionManual: 0,
  attentionAwaiting: 0,
  refunded: 0,
};

/** One store's row of `orderMetricsPipeline`, shaped as `storeMetrics` reports it; a store with no orders reads as zeros. */
export function shapeOrderMetrics(row: OrderMetricsRow | undefined): OrderMetrics {
  const r = row ?? { _id: "", ...NO_ORDERS };
  const attention = {
    exception: r.attentionException,
    manual_routing: r.attentionManual,
    awaiting_production: r.attentionAwaiting,
    total: r.attentionException + r.attentionManual + r.attentionAwaiting,
  };
  return {
    orderCount: r.orderCount,
    paidOrders: r.paidOrders,
    grossSales: r.grossSales,
    inProduction: r.inProduction,
    shipped: r.shipped,
    delivered: r.delivered,
    cancelled: r.cancelled,
    exceptions: r.exceptions,
    manualRouting: r.manualRouting,
    awaitingAction: attention.total,
    attention,
    refunded: r.refunded,
  };
}

/** Published and draft product counts for each store. */
export function productCountsPipeline(storeIds: string[]) {
  return [
    { $match: { storeId: { $in: storeIds } } },
    {
      $group: {
        _id: "$storeId",
        publishedProducts: count(statusIs("published")),
        draftProducts: count(statusIn(["draft", "in_review"])),
      },
    },
  ];
}

/**
 * The store's five best sellers by revenue, as `storeMetrics` ranks them. Equal
 * revenue keeps the order the products first appear in, newest order first, and
 * each is named as its newest order line names it.
 */
export function topProductsPipeline(storeId: string) {
  return [
    { $match: { storeId, status: { $in: REVENUE } } },
    { $sort: { createdAt: -1 } },
    { $unwind: { path: "$items", includeArrayIndex: "line" } },
    {
      $group: {
        _id: "$items.storeProductId",
        name: { $first: "$items.productName" },
        units: { $sum: "$items.quantity" },
        revenue: { $sum: { $multiply: ["$items.unitPrice", "$items.quantity"] } },
        firstAt: { $first: "$createdAt" },
        firstLine: { $first: "$line" },
      },
    },
    { $sort: { revenue: -1, firstAt: -1, firstLine: 1 } },
    { $limit: 5 },
    { $project: { _id: 0, name: 1, units: 1, revenue: 1 } },
  ];
}

export type SetupStatus = Record<SetupStep, boolean>;

/**
 * Whether each guided setup step is done. A store always has a language and the
 * built-in policies, so those two start complete. `shipsWithRates` is whether a
 * shipping zone has at least one rate: without one checkout has nothing to offer.
 * A storefront built from a template is branded, so `fromTemplate` completes
 * branding too.
 */
export function setupStatus(setup: Partial<StoreSetupState>, shipsWithRates: boolean, fromTemplate = false): SetupStatus {
  return {
    branding: Boolean(setup.branding) || fromTemplate,
    languages: true,
    localisation: Boolean(setup.localisation),
    support: Boolean(setup.support),
    domain: Boolean(setup.domain),
    payments: Boolean(setup.payments),
    shipping: Boolean(setup.shipping),
    zones: shipsWithRates,
    tax: Boolean(setup.tax),
    policies: true,
  };
}

/**
 * Counted against `SETUP_STEPS`, not the keys the status carries: a step that
 * is missing counts as not done, so nothing reads as fully set up by omission.
 */
export function setupProgress(status: Partial<SetupStatus>): { done: number; total: number; pct: number } {
  const done = SETUP_STEPS.filter((step) => status[step]).length;
  return { done, total: SETUP_STEPS.length, pct: (done / SETUP_STEPS.length) * 100 };
}

/** The steps a store cannot take orders without. The rest are optional. */
export const SELLING_STEPS = ["payments", "shipping", "zones"] as const;

type SellingStep = (typeof SELLING_STEPS)[number];
const isSellingStep = (step: string): step is SellingStep => (SELLING_STEPS as readonly string[]).includes(step);

/** Unfinished steps, split into what blocks selling and what is optional. */
export function setupRemaining(status: Partial<SetupStatus>) {
  const missing = SETUP_STEPS.filter((step) => !status[step]);
  return {
    toSell: missing.filter(isSellingStep),
    optional: missing.filter((step): step is Exclude<typeof step, SellingStep> => !isSellingStep(step)),
  };
}

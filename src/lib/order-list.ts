/**
 * Reading the store's order queue: the filters set on the Orders page, the
 * paging under the table, and the spreadsheet downloaded from it.
 *
 * Everything here is pure, so `npm run order-list-check` exercises the
 * filtering, the paging and the CSV without a database — and the page and the
 * download read the same query string through the same functions, which is what
 * keeps a filtered view and its download describing the same orders.
 */
import { csvDocument } from "./audit-log";
import { countryName } from "./countries";
import { ORDER_STATUS_LABELS, type Order, type OrderStatus } from "./types";
import { CARRIER_LABELS, slugify, toMajorString } from "./util";

/** Orders per page. The table is read top to bottom, so a screenful at a time. */
export const ORDERS_PAGE_SIZE = 25;

export interface OrderListFilters {
  status: OrderStatus | null;
  q: string;
  /** "attention" narrows to the orders a manager still has to do something about. */
  view: "attention" | null;
  /** A gift campaign code, when the queue is being worked one programme at a time. */
  campaign: string | null;
  page: number;
}

/** The query parameters the Orders page accepts, straight off the URL. */
export interface OrderListParams {
  status?: string | string[];
  q?: string | string[];
  view?: string | string[];
  campaign?: string | string[];
  page?: string | string[];
}

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? (value[0] ?? "") : (value ?? "")).trim();
}

function isOrderStatus(value: string): value is OrderStatus {
  return value in ORDER_STATUS_LABELS;
}

export function parseOrderFilters(params: OrderListParams): OrderListFilters {
  const status = one(params.status);
  const page = Number.parseInt(one(params.page), 10);
  return {
    status: status && isOrderStatus(status) ? status : null,
    q: one(params.q),
    view: one(params.view) === "attention" ? "attention" : null,
    campaign: one(params.campaign) || null,
    page: Number.isFinite(page) && page > 1 ? page : 1,
  };
}

export function hasOrderFilters(filters: OrderListFilters): boolean {
  return Boolean(filters.status || filters.q || filters.view || filters.campaign);
}

/** The query string for a link that keeps the current filters. */
export function orderListQuery(
  filters: OrderListFilters,
  overrides: Partial<OrderListFilters> = {},
): string {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (merged.status) params.set("status", merged.status);
  if (merged.q) params.set("q", merged.q);
  if (merged.view) params.set("view", merged.view);
  if (merged.campaign) params.set("campaign", merged.campaign);
  if (merged.page > 1) params.set("page", String(merged.page));
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Whether an order still needs somebody on the store team to act on it. */
export function needsAttention(order: Order): boolean {
  return (
    order.status === "exception" || order.fulfillment.routing === "manual_required" || order.status === "paid"
  );
}

export interface OrderFilterOptions {
  /**
   * Platform access reads the queue without the shopper records in it, so the
   * shopper fields are not searchable either — a hit would name the shopper
   * just as plainly as printing the column.
   */
  viaPlatform?: boolean;
}

export function matchesOrderFilters(
  order: Order,
  filters: OrderListFilters,
  options: OrderFilterOptions = {},
): boolean {
  if (filters.campaign && order.campaign?.campaignCode !== filters.campaign) return false;
  if (filters.status && order.status !== filters.status) return false;
  if (filters.view === "attention" && !needsAttention(order)) return false;
  if (!filters.q) return true;
  const haystack = (
    options.viaPlatform
      ? `${order.code} ${order.fulfillment.trackingNumber ?? ""}`
      : `${order.code} ${order.customer.name} ${order.customer.email} ${order.fulfillment.trackingNumber ?? ""}`
  ).toLowerCase();
  return haystack.includes(filters.q.toLowerCase());
}

export function filterOrders(
  orders: Order[],
  filters: OrderListFilters,
  options: OrderFilterOptions = {},
): Order[] {
  return orders.filter((order) => matchesOrderFilters(order, filters, options));
}

export interface OrderListPage {
  orders: Order[];
  page: number;
  pages: number;
  total: number;
  /** 1-based position of the first and last order on this page. */
  first: number;
  last: number;
}

export function pageOrders(orders: Order[], page: number, size = ORDERS_PAGE_SIZE): OrderListPage {
  const total = orders.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const start = (current - 1) * size;
  const slice = orders.slice(start, start + size);
  return {
    orders: slice,
    page: current,
    pages,
    total,
    first: total === 0 ? 0 : start + 1,
    last: start + slice.length,
  };
}

/* --------------------------------------------------------------- the export */

export const ORDER_CSV_COLUMNS = [
  "Order",
  "Placed (UTC)",
  "Status",
  "Customer",
  "Email",
  "Country",
  "Items",
  "Currency",
  "Subtotal",
  "Tax",
  "Shipping",
  "Total",
  "Refunded",
  "Carrier",
  "Tracking number",
];

/** `2 × Northwind Field Tee (M / Black); 1 × Ferro Mug (White)`. */
function itemsCell(order: Order): string {
  return order.items
    .map((item) => `${item.quantity} × ${item.productName} (${item.variantName})`)
    .join("; ");
}

export function refundedTotal(order: Order): number {
  return order.refunds.reduce((sum, refund) => sum + refund.amount, 0);
}

/**
 * A spreadsheet of the orders as filtered. Amounts are written as plain numbers
 * in the order's own currency, which is a column of its own, so the totals can
 * be added up in the spreadsheet rather than read back out of a symbol.
 */
export function orderCsv(orders: Order[]): string {
  const rows = orders.map((order) => [
    order.code,
    order.createdAt,
    ORDER_STATUS_LABELS[order.status],
    order.customer.name,
    order.customer.email,
    countryName(order.customer.country),
    itemsCell(order),
    order.currency.toUpperCase(),
    toMajorString(order.subtotal, order.currency),
    toMajorString(order.taxAmount, order.currency),
    toMajorString(order.shipping, order.currency),
    toMajorString(order.total, order.currency),
    toMajorString(refundedTotal(order), order.currency),
    order.fulfillment.carrier ? CARRIER_LABELS[order.fulfillment.carrier] : "",
    order.fulfillment.trackingNumber ?? "",
  ]);
  return csvDocument([ORDER_CSV_COLUMNS, ...rows]);
}

/** e.g. `northwind-supply-co-orders-shipped-2026-08-05.csv`. */
export function orderFileName(label: string, filters: OrderListFilters, today: string): string {
  const parts = [
    slugify(label) || "orders",
    filters.campaign ? slugify(filters.campaign) : "",
    filters.status ?? "",
    filters.view ?? "",
    today,
  ];
  return `${parts.filter(Boolean).join("-")}.csv`;
}

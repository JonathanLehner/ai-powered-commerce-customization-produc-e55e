/**
 * A store's customers: how a record is built from that store's orders, the
 * filters, sorting and paging on the Customers page, and the spreadsheet
 * downloaded from it.
 *
 * Everything here is pure, so `npm run customers-check` exercises it without a
 * database, and the page and the download read the same query string through
 * the same functions. The reads and writes live in `lib/customer-data.ts`.
 */
import { csvDocument } from "./audit-log";
import { countryName } from "./countries";
import { convert } from "./pricing";
import type { Customer, Order } from "./types";
import { slugify, toMajorString } from "./util";

/** Customers per page, the same screenful as the order queue. */
export const CUSTOMERS_PAGE_SIZE = 25;
/** "Ordered recently" means within this many days. */
export const RECENT_DAYS = 90;

const DAY = 86_400_000;

/** The key a customer is stored under: one record per address per store, whatever its case. */
export function customerKey(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * What a deleted customer's address becomes, on the record and on every order.
 * It stays unique per customer, so the orders still group under one record.
 */
export function anonymisedEmail(customerId: string): string {
  return `deleted-${customerId}@anonymised.invalid`;
}

/** Orders that count as money in: paid and not cancelled. Refunds come off below. */
export function countsTowardSpend(order: Pick<Order, "status" | "payment">): boolean {
  return order.status !== "cancelled" && (order.payment.status === "succeeded" || order.payment.status === "refunded");
}

function refunded(order: Order): number {
  return order.refunds.reduce((sum, refund) => sum + refund.amount, 0);
}

/** The value seen most often, ties going to the most recent. `values` is newest first. */
function mostFrequent(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best = values[0];
  for (const value of values) if ((counts.get(value) ?? 0) > (counts.get(best) ?? 0)) best = value;
  return best;
}

export type CustomerFigures = Omit<Customer, "id" | "storeId" | "notes" | "createdAt" | "updatedAt">;

/**
 * Everything on a customer record that comes from orders. `orders` are the
 * store's orders for one address. Spend and refunds are converted into the
 * store's currency at the rates checkout uses, the way Analytics adds them up.
 */
export function customerFigures(
  orders: Order[],
  store: { defaultCurrency: string; defaultLanguage: string },
): CustomerFigures | null {
  if (orders.length === 0) return null;
  const newest = [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latest = newest[0];
  const currency = store.defaultCurrency;
  let lifetimeSpend = 0;
  let refundedTotal = 0;
  let refundCount = 0;
  for (const order of newest) {
    const back = refunded(order);
    refundedTotal += convert(back, order.currency, currency);
    refundCount += order.refunds.length;
    if (countsTowardSpend(order)) lifetimeSpend += convert(order.total - back, order.currency, currency);
  }
  return {
    email: customerKey(latest.customer.email),
    name: latest.customer.name,
    country: latest.customer.country,
    firstOrderAt: newest[newest.length - 1].createdAt,
    lastOrderAt: latest.createdAt,
    orderCount: orders.length,
    lifetimeSpend,
    refundedTotal,
    refundCount,
    currency,
    preferredLanguage: mostFrequent(newest.map((o) => o.locale ?? store.defaultLanguage)),
    preferredCurrency: mostFrequent(newest.map((o) => o.currency.toUpperCase())),
    anonymisedAt: latest.customer.anonymisedAt ?? null,
  };
}

/** The store's orders grouped by customer key, for the backfill's one read per store. */
export function groupOrdersByCustomer(orders: Order[]): Map<string, Order[]> {
  const out = new Map<string, Order[]>();
  for (const order of orders) {
    const key = customerKey(order.customer.email);
    if (!key) continue;
    out.set(key, [...(out.get(key) ?? []), order]);
  }
  return out;
}

/* ---------------------------------------------------------------- the list */

export const CUSTOMER_SORTS = ["name", "lastOrder", "firstOrder", "orders", "spend"] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

export interface CustomerListFilters {
  q: string;
  country: string | null;
  refunds: boolean;
  recent: boolean;
  sort: CustomerSort;
  dir: "asc" | "desc";
  page: number;
}

export interface CustomerListParams {
  q?: string | string[];
  country?: string | string[];
  refunds?: string | string[];
  recent?: string | string[];
  sort?: string | string[];
  dir?: string | string[];
  page?: string | string[];
}

const DEFAULT_SORT: CustomerSort = "lastOrder";

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? (value[0] ?? "") : (value ?? "")).trim();
}

/** The direction a column sorts in first: names A to Z, everything else highest first. */
export function defaultDir(sort: CustomerSort): "asc" | "desc" {
  return sort === "name" ? "asc" : "desc";
}

export function parseCustomerFilters(params: CustomerListParams): CustomerListFilters {
  const sortRaw = one(params.sort);
  const sort = (CUSTOMER_SORTS as readonly string[]).includes(sortRaw) ? (sortRaw as CustomerSort) : DEFAULT_SORT;
  const dirRaw = one(params.dir);
  const country = one(params.country).toUpperCase();
  const page = Number.parseInt(one(params.page), 10);
  return {
    q: one(params.q),
    country: /^[A-Z]{2}$/.test(country) ? country : null,
    refunds: one(params.refunds) === "1",
    recent: one(params.recent) === "1",
    sort,
    dir: dirRaw === "asc" || dirRaw === "desc" ? dirRaw : defaultDir(sort),
    page: Number.isFinite(page) && page > 1 ? page : 1,
  };
}

export function hasCustomerFilters(filters: CustomerListFilters): boolean {
  return Boolean(filters.q || filters.country || filters.refunds || filters.recent);
}

export function customerListQuery(
  filters: CustomerListFilters,
  overrides: Partial<CustomerListFilters> = {},
): string {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (merged.q) params.set("q", merged.q);
  if (merged.country) params.set("country", merged.country);
  if (merged.refunds) params.set("refunds", "1");
  if (merged.recent) params.set("recent", "1");
  if (merged.sort !== DEFAULT_SORT || merged.dir !== defaultDir(merged.sort)) {
    params.set("sort", merged.sort);
    params.set("dir", merged.dir);
  }
  if (merged.page > 1) params.set("page", String(merged.page));
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function matchesCustomerFilters(customer: Customer, filters: CustomerListFilters, now: Date): boolean {
  if (filters.country && customer.country !== filters.country) return false;
  if (filters.refunds && customer.refundCount === 0) return false;
  if (filters.recent && Date.parse(customer.lastOrderAt) < now.getTime() - RECENT_DAYS * DAY) return false;
  if (!filters.q) return true;
  return `${customer.name} ${customer.email}`.toLowerCase().includes(filters.q.toLowerCase());
}

function compare(a: Customer, b: Customer, sort: CustomerSort): number {
  switch (sort) {
    case "name":
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.email.localeCompare(b.email);
    case "firstOrder":
      return a.firstOrderAt.localeCompare(b.firstOrderAt);
    case "orders":
      return a.orderCount - b.orderCount;
    case "spend":
      return a.lifetimeSpend - b.lifetimeSpend;
    case "lastOrder":
      return a.lastOrderAt.localeCompare(b.lastOrderAt);
  }
}

/** Filtered and sorted; ties keep a stable order by email so paging never repeats a row. */
export function filterCustomers(customers: Customer[], filters: CustomerListFilters, now: Date): Customer[] {
  const sign = filters.dir === "asc" ? 1 : -1;
  return customers
    .filter((customer) => matchesCustomerFilters(customer, filters, now))
    .sort((a, b) => sign * compare(a, b, filters.sort) || a.email.localeCompare(b.email));
}

export interface CustomerListPage {
  customers: Customer[];
  page: number;
  pages: number;
  total: number;
  first: number;
  last: number;
}

export function pageCustomers(customers: Customer[], page: number, size = CUSTOMERS_PAGE_SIZE): CustomerListPage {
  const total = customers.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const start = (current - 1) * size;
  const slice = customers.slice(start, start + size);
  return { customers: slice, page: current, pages, total, first: total === 0 ? 0 : start + 1, last: start + slice.length };
}

/* --------------------------------------------------------------- the export */

export const CUSTOMER_CSV_COLUMNS = [
  "Name",
  "Email",
  "Country",
  "First order (UTC)",
  "Last order (UTC)",
  "Orders",
  "Currency",
  "Lifetime spend",
  "Refunded",
  "Language",
  "Preferred currency",
];

export function customerCsv(
  customers: Customer[],
  labels: {
    columns?: string[];
    country?: (code: string) => string;
    language?: (code: string) => string;
    /** What a deleted customer's name reads as. */
    deleted?: string;
  } = {},
): string {
  const country = labels.country ?? countryName;
  const language = labels.language ?? ((code: string) => code);
  const rows = customers.map((customer) => [
    customer.anonymisedAt ? (labels.deleted ?? "Deleted customer") : customer.name,
    customer.anonymisedAt ? "" : customer.email,
    country(customer.country),
    customer.firstOrderAt,
    customer.lastOrderAt,
    String(customer.orderCount),
    customer.currency.toUpperCase(),
    toMajorString(customer.lifetimeSpend, customer.currency),
    toMajorString(customer.refundedTotal, customer.currency),
    language(customer.preferredLanguage),
    customer.preferredCurrency,
  ]);
  return csvDocument([labels.columns ?? CUSTOMER_CSV_COLUMNS, ...rows]);
}

/** e.g. `northwind-supply-co-customers-de-2026-10-11.csv`. */
export function customerFileName(label: string, filters: CustomerListFilters, today: string): string {
  const parts = [
    slugify(label) || "customers",
    filters.country?.toLowerCase() ?? "",
    filters.refunds ? "refunds" : "",
    filters.recent ? `last-${RECENT_DAYS}-days` : "",
    today,
  ];
  return `${parts.filter(Boolean).join("-")}.csv`;
}

/**
 * Store analytics: the date ranges the Analytics page offers, the aggregation
 * pipelines that add the orders up inside MongoDB, and the shaping of what they
 * return into KPIs, a filled time series and the CSV of the daily series.
 *
 * Everything here is pure, so `npm run analytics-check` can run the pipelines
 * against a known dataset and assert the maths. The reads themselves live in
 * `lib/analytics-data.ts`.
 *
 * Revenue is what the shopper was charged (the order total) less what was
 * refunded on that order, converted into the store's currency with the same
 * rates `convert()` uses. Cancelled orders and orders whose payment never
 * succeeded are left out entirely. Days are UTC days, and an order and its
 * refunds both count on the day the order was placed.
 */
import { csvDocument } from "./audit-log";
import { FX_TO_USD } from "./pricing";
import { toMajorString } from "./util";

export const RANGE_KEYS = ["7d", "30d", "90d", "12m", "custom"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

/** Longest custom range, in days: two years of daily rows is plenty for a spreadsheet. */
export const MAX_RANGE_DAYS = 731;
/** Ranges up to this many days are drawn by day, longer ones by week. */
const DAILY_LIMIT = 62;
/** Rows in each top-products and top-codes table. */
export const TOP_ROWS = 10;
/** Days drawn in the dashboard's sparkline. */
export const SPARKLINE_DAYS = 30;

const DAY = 86_400_000;

export interface AnalyticsRange {
  key: RangeKey;
  /** First day, inclusive, as YYYY-MM-DD (UTC). */
  from: string;
  /** Last day, inclusive. */
  to: string;
  days: number;
  /** 1 for daily buckets, 7 for weekly. */
  bucketDays: number;
  /** The same number of days immediately before `from`. */
  previous: { from: string; to: string };
}

export function addDays(day: string, count: number): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + count * DAY).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY);
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validDay(value: string | undefined): value is string {
  return typeof value === "string" && DAY_PATTERN.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) &&
    new Date(`${value}T00:00:00.000Z`).toISOString().startsWith(value);
}

function rangeOf(key: RangeKey, from: string, to: string): AnalyticsRange {
  const days = daysBetween(from, to) + 1;
  return {
    key,
    from,
    to,
    days,
    bucketDays: days <= DAILY_LIMIT ? 1 : 7,
    previous: { from: addDays(from, -days), to: addDays(from, -1) },
  };
}

/**
 * The range a query string asks for. Anything unreadable falls back to the
 * last 30 days; a custom range is clipped to today and to MAX_RANGE_DAYS.
 */
export function parseRange(
  params: { range?: string; from?: string; to?: string },
  now: Date,
): AnalyticsRange {
  const today = now.toISOString().slice(0, 10);
  switch (params.range) {
    case "7d":
      return rangeOf("7d", addDays(today, -6), today);
    case "90d":
      return rangeOf("90d", addDays(today, -89), today);
    case "12m": {
      const start = new Date(`${today}T00:00:00.000Z`);
      start.setUTCFullYear(start.getUTCFullYear() - 1);
      return rangeOf("12m", addDays(start.toISOString().slice(0, 10), 1), today);
    }
    case "custom": {
      if (!validDay(params.from) || !validDay(params.to)) break;
      let [from, to] = params.from <= params.to ? [params.from, params.to] : [params.to, params.from];
      if (to > today) to = today;
      if (from > to) from = to;
      if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) from = addDays(to, -(MAX_RANGE_DAYS - 1));
      return rangeOf("custom", from, to);
    }
  }
  return rangeOf("30d", addDays(today, -29), today);
}

/** The query string for a range, as the page and the export link carry it. */
export function rangeQuery(range: AnalyticsRange): string {
  const params = new URLSearchParams({ range: range.key });
  if (range.key === "custom") {
    params.set("from", range.from);
    params.set("to", range.to);
  }
  return `?${params}`;
}

/* ---------------------------------------------------------------- pipelines */

const startOf = (day: string) => `${day}T00:00:00.000Z`;
const endOf = (day: string) => startOf(addDays(day, 1));

function decimals(currency: string): number {
  return currency.toUpperCase() === "JPY" ? 0 : 2;
}

/** USD per minor unit of a currency, matching `convert()`: unknown codes count as USD. */
export function usdPerMinor(currency: string): number {
  return (FX_TO_USD[currency.toUpperCase()] ?? 1) / 10 ** decimals(currency);
}

/** The same lookup, as an aggregation expression over an order's own currency. */
function usdPerMinorExpr(currency: unknown) {
  return {
    $switch: {
      branches: Object.keys(FX_TO_USD).map((code) => ({
        case: { $eq: [{ $toUpper: currency }, code] },
        then: usdPerMinor(code),
      })),
      default: usdPerMinor("USD"),
    },
  };
}

/**
 * The orders that count, with each one's amounts already converted.
 *
 * The first stage is a plain `$match` on `storeId` and a `createdAt` range, so
 * the `{ storeId, createdAt }` index serves it and only the matching orders are
 * read. `target` is what one minor unit of the reporting currency is worth in
 * USD: a number for one store, or an expression keyed on the store for several.
 */
function paidOrderStages(storeId: string | { $in: string[] }, from: string, to: string, target: unknown, language: string) {
  return [
    {
      $match: {
        storeId,
        createdAt: { $gte: startOf(from), $lt: endOf(to) },
        status: { $ne: "cancelled" },
        "payment.status": { $in: ["succeeded", "refunded"] },
      },
    },
    {
      $project: {
        _id: 0,
        storeId: 1,
        createdAt: 1,
        currency: 1,
        items: 1,
        discount: 1,
        total: 1,
        locale: { $ifNull: ["$locale", language] },
        refunded: { $sum: "$refunds.amount" },
        units: { $sum: "$items.quantity" },
        fx: { $divide: [usdPerMinorExpr("$currency"), target] },
      },
    },
    {
      $addFields: {
        gross: { $multiply: ["$total", "$fx"] },
        refundedFx: { $multiply: ["$refunded", "$fx"] },
        net: { $multiply: [{ $subtract: ["$total", "$refunded"] }, "$fx"] },
      },
    },
  ];
}

/** Whole days from `from` to the order, rounded down to the start of its bucket. */
function bucketExpr(from: string, bucketDays: number) {
  const day = {
    $dateDiff: { startDate: new Date(startOf(from)), endDate: { $dateFromString: { dateString: "$createdAt" } }, unit: "day" },
  };
  return bucketDays === 1 ? day : { $multiply: [{ $floor: { $divide: [day, bucketDays] } }, bucketDays] };
}

const SERIES_GROUP = {
  revenue: { $sum: "$net" },
  gross: { $sum: "$gross" },
  refunded: { $sum: "$refundedFx" },
  orders: { $sum: 1 },
  units: { $sum: "$units" },
};

function seriesStages(range: AnalyticsRange, bucketDays: number) {
  return [{ $group: { _id: bucketExpr(range.from, bucketDays), ...SERIES_GROUP } }, { $sort: { _id: 1 } }];
}

const current = { $match: { period: "current" } };

function productStages(sort: Record<string, 1 | -1>) {
  return [
    current,
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.storeProductId",
        name: { $first: "$items.productName" },
        units: { $sum: "$items.quantity" },
        revenue: { $sum: { $multiply: ["$items.unitPrice", "$items.quantity", "$fx"] } },
      },
    },
    { $sort: { ...sort, _id: 1 } },
    { $limit: TOP_ROWS },
  ];
}

function discountStages(sort: Record<string, 1 | -1>) {
  return [
    { $match: { period: "current", "discount.codeId": { $type: "string" } } },
    {
      $group: {
        _id: "$discount.codeId",
        code: { $first: "$discount.code" },
        uses: { $sum: 1 },
        revenue: { $sum: "$net" },
        discounted: { $sum: { $multiply: ["$discount.amount", "$fx"] } },
      },
    },
    { $sort: { ...sort, _id: 1 } },
    { $limit: TOP_ROWS },
  ];
}

/**
 * Everything the Analytics page shows, in one aggregation: both periods are
 * read with one indexed match and split by `$facet`.
 */
export function analyticsPipeline(
  store: { id: string; defaultCurrency: string; defaultLanguage: string },
  range: AnalyticsRange,
) {
  return [
    ...paidOrderStages(store.id, range.previous.from, range.to, usdPerMinor(store.defaultCurrency), store.defaultLanguage),
    { $addFields: { period: { $cond: [{ $gte: ["$createdAt", startOf(range.from)] }, "current", "previous"] } } },
    {
      $facet: {
        totals: [{ $group: { _id: "$period", ...SERIES_GROUP } }],
        series: [current, ...seriesStages(range, range.bucketDays)],
        languages: [current, { $group: { _id: "$locale", revenue: { $sum: "$net" }, orders: { $sum: 1 } } }, { $sort: { revenue: -1, _id: 1 } }],
        currencies: [
          current,
          {
            $group: {
              _id: { $toUpper: "$currency" },
              revenue: { $sum: "$net" },
              native: { $sum: { $subtract: ["$total", "$refunded"] } },
              orders: { $sum: 1 },
            },
          },
          { $sort: { revenue: -1, _id: 1 } },
        ],
        productsByRevenue: productStages({ revenue: -1 }),
        productsByUnits: productStages({ units: -1, revenue: -1 }),
        discountsByUses: discountStages({ uses: -1, revenue: -1 }),
        discountsByRevenue: discountStages({ revenue: -1, uses: -1 }),
      },
    },
  ];
}

/** One row per day with orders in the range, for the CSV. */
export function dailySeriesPipeline(
  store: { id: string; defaultCurrency: string; defaultLanguage: string },
  range: AnalyticsRange,
) {
  return [
    ...paidOrderStages(store.id, range.from, range.to, usdPerMinor(store.defaultCurrency), store.defaultLanguage),
    ...seriesStages(range, 1),
  ];
}

/** Daily net revenue for several stores at once, each in its own currency. */
export function sparklinePipeline(stores: { id: string; defaultCurrency: string }[], range: AnalyticsRange) {
  const target = {
    $switch: {
      branches: stores.map((store) => ({ case: { $eq: ["$storeId", store.id] }, then: usdPerMinor(store.defaultCurrency) })),
      default: usdPerMinor("USD"),
    },
  };
  return [
    ...paidOrderStages({ $in: stores.map((store) => store.id) }, range.from, range.to, target, ""),
    { $group: { _id: { store: "$storeId", day: bucketExpr(range.from, 1) }, revenue: { $sum: "$net" } } },
  ];
}

/* ------------------------------------------------------------------ shaping */

export interface Kpis {
  /** Net of refunds, in the store's minor units. */
  revenue: number;
  gross: number;
  refunded: number;
  orders: number;
  units: number;
  /** Net revenue per order. */
  aov: number;
  /** Share of gross sales refunded, 0 to 1. */
  refundRate: number;
}

export interface SeriesPoint {
  /** First day of the bucket, YYYY-MM-DD. */
  date: string;
  revenue: number;
  gross: number;
  refunded: number;
  orders: number;
  units: number;
}

export interface AnalyticsReport {
  range: AnalyticsRange;
  currency: string;
  current: Kpis;
  previous: Kpis;
  series: SeriesPoint[];
  languages: { code: string; revenue: number; orders: number }[];
  currencies: { code: string; revenue: number; native: number; orders: number }[];
  productsByRevenue: { id: string; name: string; units: number; revenue: number }[];
  productsByUnits: { id: string; name: string; units: number; revenue: number }[];
  discountsByUses: { id: string; code: string; uses: number; revenue: number; discounted: number }[];
  discountsByRevenue: { id: string; code: string; uses: number; revenue: number; discounted: number }[];
}

type SeriesRow = { _id: number; revenue: number; gross: number; refunded: number; orders: number; units: number };

/** What `analyticsPipeline` returns: one document of facets. */
export interface AnalyticsFacets {
  totals: (Omit<SeriesRow, "_id"> & { _id: "current" | "previous" })[];
  series: SeriesRow[];
  languages: { _id: string; revenue: number; orders: number }[];
  currencies: { _id: string; revenue: number; native: number; orders: number }[];
  productsByRevenue: { _id: string; name: string; units: number; revenue: number }[];
  productsByUnits: { _id: string; name: string; units: number; revenue: number }[];
  discountsByUses: { _id: string; code: string; uses: number; revenue: number; discounted: number }[];
  discountsByRevenue: { _id: string; code: string; uses: number; revenue: number; discounted: number }[];
}

function kpis(row: Omit<SeriesRow, "_id"> | undefined): Kpis {
  const revenue = Math.round(row?.revenue ?? 0);
  const gross = Math.round(row?.gross ?? 0);
  const refunded = Math.round(row?.refunded ?? 0);
  const orders = row?.orders ?? 0;
  return {
    revenue,
    gross,
    refunded,
    orders,
    units: row?.units ?? 0,
    aov: orders ? Math.round(revenue / orders) : 0,
    refundRate: gross ? refunded / gross : 0,
  };
}

/** Every bucket in the range, zero where nothing was sold. */
export function fillSeries(rows: SeriesRow[], range: AnalyticsRange, bucketDays: number): SeriesPoint[] {
  const byOffset = new Map(rows.map((row) => [row._id, row]));
  const points: SeriesPoint[] = [];
  for (let offset = 0; offset < range.days; offset += bucketDays) {
    const row = byOffset.get(offset);
    points.push({
      date: addDays(range.from, offset),
      revenue: Math.round(row?.revenue ?? 0),
      gross: Math.round(row?.gross ?? 0),
      refunded: Math.round(row?.refunded ?? 0),
      orders: row?.orders ?? 0,
      units: row?.units ?? 0,
    });
  }
  return points;
}

export function shapeReport(facets: AnalyticsFacets | undefined, range: AnalyticsRange, currency: string): AnalyticsReport {
  const totals = facets?.totals ?? [];
  const product = (row: AnalyticsFacets["productsByRevenue"][number]) => ({
    id: row._id,
    name: row.name,
    units: row.units,
    revenue: Math.round(row.revenue),
  });
  const discount = (row: AnalyticsFacets["discountsByUses"][number]) => ({
    id: row._id,
    code: row.code,
    uses: row.uses,
    revenue: Math.round(row.revenue),
    discounted: Math.round(row.discounted),
  });
  return {
    range,
    currency,
    current: kpis(totals.find((row) => row._id === "current")),
    previous: kpis(totals.find((row) => row._id === "previous")),
    series: fillSeries(facets?.series ?? [], range, range.bucketDays),
    languages: (facets?.languages ?? []).map((row) => ({ code: row._id, revenue: Math.round(row.revenue), orders: row.orders })),
    currencies: (facets?.currencies ?? []).map((row) => ({
      code: row._id,
      revenue: Math.round(row.revenue),
      native: row.native,
      orders: row.orders,
    })),
    productsByRevenue: (facets?.productsByRevenue ?? []).map(product),
    productsByUnits: (facets?.productsByUnits ?? []).map(product),
    discountsByUses: (facets?.discountsByUses ?? []).map(discount),
    discountsByRevenue: (facets?.discountsByRevenue ?? []).map(discount),
  };
}

/** Change from the previous period as a fraction, or null when there is nothing to compare with. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}

/** One series of daily values per store, oldest first, zero-filled. */
export function shapeSparklines(
  rows: { _id: { store: string; day: number }; revenue: number }[],
  storeIds: string[],
  days: number,
): Map<string, number[]> {
  const lines = new Map(storeIds.map((id) => [id, Array.from({ length: days }, () => 0)]));
  for (const row of rows) {
    const line = lines.get(row._id.store);
    if (line && row._id.day >= 0 && row._id.day < days) line[row._id.day] = Math.round(row.revenue);
  }
  return lines;
}

/** The daily series as a spreadsheet, amounts in major units of the store's currency. */
export function seriesCsv(points: SeriesPoint[], currency: string, columns: string[]): string {
  const money = (minor: number) => toMajorString(minor, currency);
  return csvDocument([
    columns,
    ...points.map((point) => [
      point.date,
      String(point.orders),
      String(point.units),
      money(point.gross),
      money(point.refunded),
      money(point.revenue),
    ]),
  ]);
}

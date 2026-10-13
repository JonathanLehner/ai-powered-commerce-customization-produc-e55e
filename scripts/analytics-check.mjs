// Self-check for the store analytics maths: npm run analytics-check
//
// The Analytics page and the dashboard sparklines add orders up inside MongoDB.
// This writes a known set of orders into the development database, runs the
// real pipelines over them and asserts every figure: refunds come off revenue,
// cancelled and unpaid orders count for nothing, other currencies are converted
// into the store's at the rates checkout uses, margin takes off each line's
// supplier, customisation and shipping cost (the product's current costs where
// the order predates keeping them), orders that ever hit an exception are
// counted, and the match is served by the { storeId, createdAt } index rather
// than a collection scan.
//
// It needs MONGODB_URI and MONGODB_DB from `.env.local`, and refuses to run
// against production.
import assert from "node:assert/strict";
import { PRODUCTION_DB, openDatabase } from "./mongo.mjs";
import {
  analyticsPipeline,
  parseRange,
  percentChange,
  rangeQuery,
} from "../src/lib/analytics.ts";
import { convert } from "../src/lib/pricing.ts";
import { ensureIndexes } from "../src/lib/db-indexes.ts";

if (!process.env.MONGODB_DB || process.env.MONGODB_DB === PRODUCTION_DB) {
  console.error("analytics-check writes test data: set MONGODB_DB to the development database (see .env.local).");
  process.exit(1);
}

/* ------------------------------------------------------------------ ranges */

const now = new Date("2026-06-15T09:30:00Z");
{
  const week = parseRange({ range: "7d" }, now);
  assert.deepEqual([week.from, week.to, week.days, week.bucketDays], ["2026-06-09", "2026-06-15", 7, 1]);
  assert.deepEqual(week.previous, { from: "2026-06-02", to: "2026-06-08" }, "the same number of days just before");

  const month = parseRange({}, now);
  assert.deepEqual([month.key, month.from, month.days, month.bucketDays], ["30d", "2026-05-17", 30, 1], "30 days by default");
  assert.equal(parseRange({ range: "nonsense" }, now).key, "30d");

  const quarter = parseRange({ range: "90d" }, now);
  assert.deepEqual([quarter.from, quarter.days, quarter.bucketDays], ["2026-03-18", 90, 7], "90 days is drawn by week");

  const year = parseRange({ range: "12m" }, now);
  assert.deepEqual([year.from, year.to, year.days, year.bucketDays], ["2025-06-16", "2026-06-15", 365, 7]);

  const custom = parseRange({ range: "custom", from: "2026-05-10", to: "2026-05-01" }, now);
  assert.deepEqual([custom.from, custom.to, custom.days], ["2026-05-01", "2026-05-10", 10], "reversed dates are swapped");
  assert.equal(rangeQuery(custom), "?range=custom&from=2026-05-01&to=2026-05-10");
  assert.equal(parseRange({ range: "custom", from: "2026-06-01", to: "2026-07-30" }, now).to, "2026-06-15", "clipped to today");
  assert.equal(parseRange({ range: "custom", from: "2026-02-30", to: "2026-03-01" }, now).key, "30d", "an impossible date falls back");
  assert.equal(parseRange({ range: "custom", from: "2020-01-01", to: "2026-06-15" }, now).days, 731, "at most two years");
}

assert.equal(percentChange(150, 100), 0.5);
assert.equal(percentChange(50, 100), -0.5);
assert.equal(percentChange(0, 0), 0);
assert.equal(percentChange(10, 0), null, "nothing to compare with");
assert.equal(percentChange(-50, -100), 0.5, "a smaller loss is a rise");

/* ------------------------------------------------------------ the dataset */

const { loadDailySeries, loadSparklines, loadStoreAnalytics } = await import("../src/lib/analytics-data.ts");
const { seriesCsv } = await import("../src/lib/analytics.ts");
const { db } = await import("../src/lib/mongo.ts");

const RUN = `chk${Date.now().toString(36)}`;
const storeId = `${RUN}_usd`;
const euroStoreId = `${RUN}_eur`;
const store = { id: storeId, defaultCurrency: "USD", defaultLanguage: "en" };
// A product whose orders predate keeping customisation and shipping cost on the line.
const R = `${RUN}_R`;
const legacyProduct = { id: R, storeId, costs: { customizationCost: 50, shippingEstimate: 50 } };

let seq = 0;
function order({
  at,
  total,
  currency = "USD",
  status = "paid",
  payment = "succeeded",
  locale = "en",
  items = [],
  refunds = [],
  discount = null,
  store: owner = storeId,
  extra = {},
}) {
  seq += 1;
  const doc = {
    id: `ord_${RUN}_${seq}`,
    storeId: owner,
    code: `${RUN}-${seq}`,
    status,
    currency,
    items: items.map(([product, quantity, unitPrice, costs = {}], i) => ({
      id: `itm_${seq}_${i}`,
      storeProductId: product,
      productName: `Product ${product}`,
      quantity,
      unitPrice,
      ...costs,
    })),
    total,
    discount,
    payment: { provider: "stripe", status: payment },
    refunds: refunds.map((amount, i) => ({ id: `rf_${seq}_${i}`, amount, reason: "", at, actor: "check" })),
    createdAt: at,
    ...extra,
  };
  if (locale) doc.locale = locale;
  return doc;
}

// Per-unit costs as checkout keeps them on the line.
const costP = { supplierCost: 1000, customizationCost: 200, shippingCost: 300 };
const costQ = { supplierCost: 1500, customizationCost: 0, shippingCost: 500 };
const save10 = (amount) => ({ codeId: `dsc_${RUN}`, code: "SAVE10", kind: "percent", value: 10, amount });

const orders = [
  // The current period: 1 to 10 March.
  // Hit an exception that has since been resolved: it still counts.
  order({
    at: "2026-03-01T08:00:00.000Z",
    total: 10000,
    status: "in_production",
    items: [["P", 2, 3000, costP], ["Q", 1, 4000, costQ]],
    extra: { events: [{ status: "Exception raised" }, { status: "Exception resolved" }], fulfillment: { exception: null } },
  }),
  order({
    at: "2026-03-03T10:00:00.000Z",
    total: 5000,
    status: "delivered",
    locale: "de",
    items: [["Q", 1, 5000, costQ]],
    refunds: [1000, 500],
    discount: save10(500),
  }),
  order({
    at: "2026-03-03T18:00:00.000Z",
    total: 2000,
    currency: "EUR",
    status: "shipped",
    locale: "fr",
    items: [["P", 2, 1000, costP]],
    discount: save10(200),
    // Charged in euros; the costs are in the store's dollars.
    extra: { shopCurrency: "USD" },
  }),
  // No locale recorded: counted under the store's language. JPY has no minor unit.
  // In exception now; only the base cost is on the line, the rest comes from the product.
  order({
    at: "2026-03-10T23:59:59.999Z",
    total: 1000,
    currency: "JPY",
    status: "exception",
    locale: null,
    items: [[R, 1, 1000, { supplierCost: 100 }]],
    extra: { fulfillment: { exception: "Address could not be verified" } },
  }),
  // Left out: cancelled (even though refunded), unpaid, failed, out of range, another store.
  order({ at: "2026-03-02T09:00:00.000Z", total: 9999, status: "cancelled", payment: "refunded", refunds: [9999], items: [["P", 5, 2000]] }),
  order({ at: "2026-03-02T09:00:00.000Z", total: 7777, status: "awaiting_payment", payment: "requires_payment", items: [["P", 1, 7777]] }),
  order({ at: "2026-03-04T09:00:00.000Z", total: 6666, status: "exception", payment: "failed", items: [["P", 1, 6666]] }),
  order({ at: "2026-03-11T00:00:00.000Z", total: 5555, items: [["P", 1, 5555]] }),
  order({ at: "2026-03-05T00:00:00.000Z", total: 1080, store: euroStoreId, items: [["Z", 1, 1080]] }),
  // The previous period: 19 to 28 February.
  order({ at: "2026-02-25T12:00:00.000Z", total: 4000, status: "delivered", items: [["P", 1, 4000, { supplierCost: 1000 }]] }),
  order({
    at: "2026-02-20T12:00:00.000Z",
    total: 3000,
    status: "delivered",
    payment: "refunded",
    refunds: [3000],
    items: [["Q", 1, 3000, { supplierCost: 1500 }]],
  }),
];

// The conversions the expected figures rely on, from the checkout's own helper.
assert.equal(convert(2000, "EUR", "USD"), 2160);
assert.equal(convert(1000, "JPY", "USD"), 640);
assert.equal(convert(1080, "USD", "EUR"), 1000);

const { client, db: raw } = await openDatabase({ devOnly: true });
try {
  await db.insertMany("orders", orders);
  await db.insertMany("store_products", [legacyProduct]);

  /* ------------------------------------------------------------ the report */

  const range = parseRange({ range: "custom", from: "2026-03-01", to: "2026-03-10" }, now);
  assert.equal(range.bucketDays, 1);
  const report = await loadStoreAnalytics(store, range);

  assert.deepEqual(report.current, {
    gross: 10000 + 5000 + 2160 + 640,
    refunded: 1500,
    revenue: 17800 - 1500,
    orders: 4,
    units: 3 + 1 + 2 + 1,
    aov: Math.round(16300 / 4),
    refundRate: 1500 / 17800,
    // Costs: 2×1500 + 2000, 2000, 2×1500 in dollars, and 100 + 50 + 50 yen = 128 cents.
    margin: 16300 - (5000 + 2000 + 3000 + 128),
    exceptions: 2,
    exceptionRate: 0.5,
  });
  assert.deepEqual(report.previous, {
    gross: 7000,
    refunded: 3000,
    revenue: 4000,
    orders: 2,
    units: 2,
    aov: 2000,
    refundRate: 3000 / 7000,
    margin: 4000 - (1000 + 1500),
    exceptions: 0,
    exceptionRate: 0,
  });
  assert.equal(percentChange(report.current.revenue, report.previous.revenue), 3.075);

  assert.equal(report.series.length, 10, "every day of the range, sales or not");
  assert.deepEqual(
    report.series.map((point) => [point.date, point.revenue, point.orders]).filter(([, revenue]) => revenue > 0),
    [
      ["2026-03-01", 10000, 1],
      ["2026-03-03", 3500 + 2160, 2],
      ["2026-03-10", 640, 1],
    ],
  );
  assert.equal(report.series.reduce((sum, point) => sum + point.revenue, 0), report.current.revenue);

  assert.deepEqual(report.languages, [
    { code: "en", revenue: 10640, orders: 2 },
    { code: "de", revenue: 3500, orders: 1 },
    { code: "fr", revenue: 2160, orders: 1 },
  ]);
  assert.deepEqual(report.currencies, [
    { code: "USD", revenue: 13500, native: 13500, orders: 2 },
    { code: "EUR", revenue: 2160, native: 2000, orders: 1 },
    { code: "JPY", revenue: 640, native: 1000, orders: 1 },
  ]);

  const products = (rows) => rows.map((row) => [row.id, row.units, row.revenue]);
  assert.deepEqual(products(report.productsByRevenue), [["Q", 2, 9000], ["P", 4, 8160], [R, 1, 640]]);
  assert.deepEqual(products(report.productsByUnits), [["P", 4, 8160], ["Q", 2, 9000], [R, 1, 640]]);
  assert.deepEqual(report.discountsByUses, [
    { id: `dsc_${RUN}`, code: "SAVE10", uses: 2, revenue: 5660, discounted: 716 },
  ]);

  /* ------------------------------------------------------- weekly buckets */

  const long = parseRange({ range: "custom", from: "2026-03-01", to: "2026-05-09" }, now);
  assert.equal(long.bucketDays, 7);
  const weekly = await loadStoreAnalytics(store, long);
  assert.equal(weekly.series.length, 10);
  assert.deepEqual(weekly.series.slice(0, 3).map((point) => [point.date, point.revenue]), [
    ["2026-03-01", 15660],
    ["2026-03-08", 640 + 5555],
    ["2026-03-15", 0],
  ]);

  /* ------------------------------------------------------- the daily CSV */

  const daily = await loadDailySeries(store, range);
  assert.equal(daily.length, 10);
  assert.equal(daily.reduce((sum, point) => sum + point.margin, 0), report.current.margin, "the same margin as the report");
  const csv = seriesCsv(daily, "USD", ["Date", "Orders", "Units", "Gross", "Refunds", "Net revenue", "Margin", "Exceptions", "Exception rate"]);
  const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
  assert.equal(lines.length, 11);
  assert.equal(lines[0], "Date,Orders,Units,Gross,Refunds,Net revenue,Margin,Exceptions,Exception rate");
  assert.equal(lines[1], "2026-03-01,1,3,100.00,0.00,100.00,50.00,1,100.0");
  assert.equal(lines[3], "2026-03-03,2,3,71.60,15.00,56.60,6.60,0,0.0");
  assert.equal(lines[2], "2026-03-02,0,0,0.00,0.00,0.00,0.00,0,0.0", "the cancelled and unpaid orders that day add nothing");

  /* --------------------------------------------------------- sparklines */

  const lines30 = await loadSparklines(
    [store, { id: euroStoreId, defaultCurrency: "EUR" }],
    parseRange({ range: "30d" }, new Date("2026-03-10T12:00:00Z")),
  );
  const usd = lines30.get(storeId);
  assert.equal(usd.length, 30);
  assert.equal(usd[20], 10000, "1 March is day 20 of the 30 ending 10 March");
  assert.equal(usd[22], 5660);
  assert.equal(usd[29], 640);
  assert.equal(usd.reduce((a, b) => a + b, 0), 16300 + 4000, "the same net revenue as the report, plus late February");
  assert.equal(lines30.get(euroStoreId).reduce((a, b) => a + b, 0), 1000, "each store in its own currency");
  const week = await loadSparklines([store], parseRange({ range: "7d" }, new Date("2026-03-10T12:00:00Z")));
  assert.deepEqual(week.get(storeId), [0, 0, 0, 0, 0, 0, 640], "the dashboard's chosen range, one value per day");

  /* ------------------------------------------------------- index usage */

  await ensureIndexes(raw);
  // As a command: the cursor helper refuses to explain under the URI's write concern.
  const plan = JSON.stringify(
    await raw.command({
      explain: { aggregate: "orders", pipeline: analyticsPipeline(store, range), cursor: {} },
      verbosity: "queryPlanner",
    }),
  );
  assert.ok(plan.includes("IXSCAN"), "the match reads an index");
  assert.ok(plan.includes("storeId_1_createdAt_-1"), "the store and date index");
  assert.ok(!plan.includes("COLLSCAN"), "never a collection scan");

  console.log("analytics-check: all assertions passed");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.deleteMany("orders", { storeId: { $in: [storeId, euroStoreId] } });
  await db.deleteMany("store_products", { id: R });
  await client.close();
  // The app's own client stays open, so leave explicitly.
  process.exit(process.exitCode ?? 0);
}

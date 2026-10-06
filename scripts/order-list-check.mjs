// Self-check for reading the store's order queue: npm run order-list-check
//
// The Orders page pages through the queue and hands the same filters to the
// download, so what the filter bar says it shows, what the table pages through
// and what the spreadsheet contains all have to be the same set of orders.
import assert from "node:assert/strict";
import {
  filterOrders,
  hasOrderFilters,
  matchesOrderFilters,
  needsAttention,
  orderCsv,
  orderFileName,
  orderListQuery,
  pageOrders,
  parseOrderFilters,
  refundedTotal,
  ORDERS_PAGE_SIZE,
} from "../src/lib/order-list.ts";

let counter = 0;
function order(overrides = {}) {
  counter += 1;
  const { customer, fulfillment, ...rest } = overrides;
  return {
    id: `ord_${String(counter).padStart(4, "0")}`,
    storeId: "str_northwind",
    code: `ORD-1000${counter}`,
    status: "paid",
    currency: "USD",
    customer: {
      name: "Dana Reyes",
      email: "dana@northwind.test",
      line1: "4 Mill Lane",
      city: "Leeds",
      postalCode: "LS1 4AB",
      country: "GB",
      ...customer,
    },
    items: [
      {
        id: "itm_1",
        storeProductId: "sp_tee",
        variantId: "var_m_black",
        productName: "Northwind Field Tee",
        variantName: "M / Black",
        quantity: 2,
        unitPrice: 2695,
        supplierCost: 1100,
        customization: { artworkUrl: null, artworkFileName: null, text: null, previewUrl: null },
        supplierId: "sup_gelato",
      },
    ],
    subtotal: 5390,
    shipping: 500,
    taxAmount: 1078,
    taxRate: 20,
    total: 6968,
    payment: { provider: "stripe", status: "succeeded" },
    fulfillment: {
      supplierId: "sup_gelato",
      supplierName: "Gelato",
      routing: "submitted",
      carrier: "dhl",
      trackingNumber: "JD0149",
      trackingUrl: null,
      exception: null,
      ...fulfillment,
    },
    refunds: [],
    events: [],
    idempotencyKey: null,
    createdAt: "2026-08-02T17:25:07.877Z",
    updatedAt: "2026-08-02T17:25:07.877Z",
    ...rest,
  };
}

/* ----------------------------------------------------------- reading a URL */

const empty = parseOrderFilters({});
assert.deepEqual(empty, { status: null, q: "", view: null, campaign: null, page: 1 });
assert.equal(hasOrderFilters(empty), false);

const parsed = parseOrderFilters({
  status: "shipped",
  q: "  ORD-100 ",
  view: "attention",
  campaign: "GFT-21",
  page: "3",
});
assert.deepEqual(parsed, {
  status: "shipped",
  q: "ORD-100",
  view: "attention",
  campaign: "GFT-21",
  page: 3,
});
assert.equal(hasOrderFilters(parsed), true);

// Anything the page cannot honour is dropped rather than narrowing to nothing.
assert.equal(parseOrderFilters({ status: "not_a_status" }).status, null);
assert.equal(parseOrderFilters({ view: "everything" }).view, null);
assert.equal(parseOrderFilters({ page: "0" }).page, 1);
assert.equal(parseOrderFilters({ page: "nonsense" }).page, 1);
assert.equal(parseOrderFilters({ page: ["2"] }).page, 2, "a repeated parameter reads as its first value");

// A link keeps the filters it is given and only says the page when there is one.
assert.equal(orderListQuery(empty), "");
assert.equal(orderListQuery(parsed, { page: 1 }), "?status=shipped&q=ORD-100&view=attention&campaign=GFT-21");
assert.equal(
  orderListQuery(empty, { page: 2, campaign: "GFT 21" }),
  "?campaign=GFT+21&page=2",
  "a campaign code with a space survives the round trip",
);

/* ------------------------------------------------------------- the filters */

const shipped = order({ status: "shipped", code: "ORD-SHIP" });
const exception = order({ status: "exception", code: "ORD-EXC" });
const delivered = order({
  status: "delivered",
  code: "ORD-DONE",
  customer: { name: "Sam Okafor", email: "sam@ferro.test" },
  fulfillment: { routing: "submitted", trackingNumber: "1Z900" },
});
const gift = order({
  status: "paid",
  code: "ORD-GIFT",
  campaign: { campaignId: "gcm_1", campaignCode: "GFT-21", campaignName: "Winter thanks" },
});
const all = [shipped, exception, delivered, gift];

assert.deepEqual(
  filterOrders(all, parseOrderFilters({ status: "exception" })).map((o) => o.code),
  ["ORD-EXC"],
);
assert.deepEqual(
  filterOrders(all, parseOrderFilters({ campaign: "GFT-21" })).map((o) => o.code),
  ["ORD-GIFT"],
);
assert.deepEqual(
  filterOrders(all, parseOrderFilters({ view: "attention" })).map((o) => o.code),
  ["ORD-EXC", "ORD-GIFT"],
  "an exception and an order still to be made, not the ones already on their way",
);
assert.equal(needsAttention(order({ status: "shipped", fulfillment: { routing: "manual_required" } })), true);

// The filters narrow together rather than replacing one another.
assert.deepEqual(filterOrders(all, parseOrderFilters({ view: "attention", status: "paid" })).map((o) => o.code), [
  "ORD-GIFT",
]);

// The search reads the code, the shopper and the tracking number.
assert.equal(matchesOrderFilters(delivered, parseOrderFilters({ q: "sam@ferro" })), true);
assert.equal(matchesOrderFilters(delivered, parseOrderFilters({ q: "1z900" })), true, "case does not matter");
assert.equal(matchesOrderFilters(delivered, parseOrderFilters({ q: "ord-done" })), true);

// Platform access reads the queue without the shopper records, so the search
// box cannot confirm a name the page does not print.
assert.equal(matchesOrderFilters(delivered, parseOrderFilters({ q: "sam@ferro" }), { viaPlatform: true }), false);
assert.equal(matchesOrderFilters(delivered, parseOrderFilters({ q: "1z900" }), { viaPlatform: true }), true);

/* --------------------------------------------------------------- the paging */

const many = Array.from({ length: ORDERS_PAGE_SIZE * 2 + 3 }, () => order());
const first = pageOrders(many, 1);
assert.equal(first.orders.length, ORDERS_PAGE_SIZE);
assert.deepEqual([first.page, first.pages, first.total, first.first, first.last], [1, 3, 53, 1, 25]);

const last = pageOrders(many, 3);
assert.equal(last.orders.length, 3);
assert.deepEqual([last.first, last.last], [51, 53]);
assert.equal(last.orders[0].id, many[50].id, "the pages follow one another without a gap or a repeat");

// A page past the end lands on the last one rather than on an empty table.
assert.equal(pageOrders(many, 99).page, 3);
assert.deepEqual(pageOrders([], 2), { orders: [], page: 1, pages: 1, total: 0, first: 0, last: 0 });

/* --------------------------------------------------------------- the export */

const refunded = order({
  code: "ORD-REF",
  status: "delivered",
  currency: "EUR",
  refunds: [
    { id: "ref_1", amount: 1000, reason: "Damaged", at: "2026-08-04T09:00:00.000Z", actor: "usr_alex" },
    { id: "ref_2", amount: 500, reason: "Goodwill", at: "2026-08-05T09:00:00.000Z", actor: "usr_alex" },
  ],
});
assert.equal(refundedTotal(refunded), 1500);
assert.equal(refundedTotal(shipped), 0);

const csv = orderCsv([refunded]);
const lines = csv.trimEnd().split("\r\n");
assert.equal(
  lines[0],
  "﻿Order,Placed (UTC),Status,Customer,Email,Country,Items,Currency,Subtotal,Tax,Shipping,Total,Refunded,Carrier,Tracking number",
);
assert.deepEqual(lines[1].split(",").slice(0, 6), [
  "ORD-REF",
  "2026-08-02T17:25:07.877Z",
  "Delivered",
  "Dana Reyes",
  "dana@northwind.test",
  "United Kingdom",
]);
assert.ok(lines[1].includes("2 × Northwind Field Tee (M / Black)"), "the items read as a line of their own");
assert.ok(
  orderCsv([order({ items: [{ ...refunded.items[0], productName: "Tee, long sleeve" }] })]).includes(
    '"2 × Tee, long sleeve (M / Black)"',
  ),
  "a comma in a product name is quoted rather than splitting the row",
);
assert.ok(lines[1].endsWith("EUR,53.90,10.78,5.00,69.68,15.00,DHL Express,JD0149"), lines[1]);

// An order with no carrier yet still fills the same columns.
assert.ok(
  orderCsv([order({ fulfillment: { carrier: null, trackingNumber: null } })]).trimEnd().endsWith(",,"),
);

// An empty result is still a valid spreadsheet — a header and nothing under it.
assert.equal(orderCsv([]).trimEnd().split("\r\n").length, 1);

// The download is the filtered queue, so the file name says which one it is.
assert.equal(orderFileName("Northwind Supply Co orders", empty, "2026-08-05"), "northwind-supply-co-orders-2026-08-05.csv");
assert.equal(
  orderFileName("Northwind Supply Co orders", parsed, "2026-08-05"),
  "northwind-supply-co-orders-gft-21-shipped-attention-2026-08-05.csv",
);
assert.ok(!/[^a-z0-9.\-]/.test(orderFileName("Ferro Coffee Club · Orders/2", empty, "2026-08-05")));

console.log("order-list-check ok");

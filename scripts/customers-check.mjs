// Self-check for store customers: npm run customers-check
//
// Writes orders for two stores that share a shopper's email into the
// development database, builds the customer records with the same code
// checkout and the backfill use, and asserts that:
// - each store sees only its own customers, and a customer id from one store
//   finds nothing in the other;
// - the figures come out right: refunds come off spend, cancelled and unpaid
//   orders add nothing, other currencies are converted at checkout rates;
// - rebuilding is idempotent and keeps the team's notes;
// - deleting personal data blanks name, email and address on the customer, its
//   orders, its gift list rows and its email history, keeps every amount, and
//   leaves the other store untouched;
// - the list's filters, sorting, paging and CSV behave.
//
// It needs MONGODB_URI and MONGODB_DB from `.env.local`, and refuses to run
// against production.
import assert from "node:assert/strict";
import { PRODUCTION_DB } from "./mongo.mjs";
import {
  anonymisedEmail,
  customerCsv,
  customerFigures,
  customerFileName,
  customerListQuery,
  filterCustomers,
  pageCustomers,
  parseCustomerFilters,
} from "../src/lib/customers.ts";
import { convert } from "../src/lib/pricing.ts";
import { roleCan } from "../src/lib/store-access.ts";

if (!process.env.MONGODB_DB || process.env.MONGODB_DB === PRODUCTION_DB) {
  console.error("customers-check writes test data: set MONGODB_DB to the development database (see .env.local).");
  process.exit(1);
}

const { db } = await import("../src/lib/mongo.ts");
const {
  addCustomerNote,
  anonymiseCustomer,
  customerDataExport,
  getCustomer,
  getCustomerByEmail,
  listCustomerOrders,
  listCustomers,
  syncCustomers,
  syncStoreCustomers,
} = await import("../src/lib/customer-data.ts");

/* ------------------------------------------------------------- access */

assert.equal(roleCan("store_admin", "store.orders"), true);
assert.equal(roleCan("order_manager", "store.orders"), true, "order managers work with customers");
assert.equal(roleCan("viewer", "store.orders"), false, "viewers, and platform oversight, do not see customers");
assert.equal(roleCan("catalog_manager", "store.orders"), false);

/* ------------------------------------------------------------ the dataset */

const RUN = `chk${Date.now().toString(36)}`;
const storeA = { id: `${RUN}_a`, defaultCurrency: "USD", defaultLanguage: "en" };
const storeB = { id: `${RUN}_b`, defaultCurrency: "EUR", defaultLanguage: "de" };
const SHARED = "Mia.Fischer@Example.com";

let seq = 0;
function order(storeId, { email, name = "Mia Fischer", at, total, currency = "USD", status = "paid", payment = "succeeded", locale = "en", refunds = [] }) {
  seq += 1;
  return {
    id: `${RUN}_o${seq}`,
    storeId,
    code: `${RUN}-${seq}`,
    status,
    currency,
    locale,
    customer: { name, email, line1: "Lindenstraße 4", city: "Berlin", postalCode: "10115", country: "DE" },
    items: [],
    subtotal: total,
    shipping: 0,
    taxAmount: 0,
    taxRate: 0,
    total,
    payment: { provider: "stripe", status: payment, paymentIntentId: null, stripeAccountId: null, last4: null, failureMessage: null, paidAt: null },
    fulfillment: {},
    refunds: refunds.map((amount, i) => ({ id: `${RUN}_r${seq}_${i}`, amount, reason: "Damaged", at: at, actor: "Check" })),
    events: [],
    idempotencyKey: null,
    createdAt: at,
    updatedAt: at,
  };
}

const ordersA = [
  order(storeA.id, { email: SHARED, at: "2026-03-01T10:00:00.000Z", total: 10000, refunds: [2500] }),
  order(storeA.id, { email: "mia.fischer@example.com", at: "2026-06-01T10:00:00.000Z", total: 5000, currency: "EUR", locale: "de" }),
  order(storeA.id, { email: "mia.fischer@example.com ", at: "2026-07-01T10:00:00.000Z", total: 4000, locale: "de", status: "cancelled", refunds: [4000] }),
  order(storeA.id, { email: "mia.fischer@example.com", at: "2026-08-01T10:00:00.000Z", total: 9999, payment: "requires_payment", status: "awaiting_payment", locale: "de" }),
  order(storeA.id, { email: "ola@example.com", name: "Ola Nordmann", at: "2026-02-01T10:00:00.000Z", total: 3000 }),
];
const ordersB = [order(storeB.id, { email: SHARED, at: "2026-05-01T10:00:00.000Z", total: 7000, currency: "EUR", locale: "de" })];

/* ------------------------------------------------------------ pure maths */

{
  const figures = customerFigures(ordersA.slice(0, 4), storeA);
  assert.equal(figures.email, "mia.fischer@example.com", "keyed by the lowercased address");
  assert.equal(figures.orderCount, 4, "every order counts toward the order count");
  assert.equal(figures.lifetimeSpend, 7500 + convert(5000, "EUR", "USD"), "refunds off; cancelled and unpaid add nothing");
  assert.equal(figures.refundedTotal, 6500);
  assert.equal(figures.refundCount, 2);
  assert.equal(figures.firstOrderAt, "2026-03-01T10:00:00.000Z");
  assert.equal(figures.lastOrderAt, "2026-08-01T10:00:00.000Z");
  assert.equal(figures.preferredLanguage, "de", "the language used most often");
  assert.equal(figures.preferredCurrency, "USD", "the currency used most often");
  assert.equal(customerFigures([], storeA), null);
}

/* ------------------------------------------------------------ isolation */

try {
  await db.insertMany("orders", [...ordersA, ...ordersB]);
  await syncStoreCustomers(storeA);
  await syncCustomers(storeB, [SHARED]);

  const listA = await listCustomers(storeA.id);
  const listB = await listCustomers(storeB.id);
  assert.equal(listA.length, 2, "store A has its two customers");
  assert.equal(listB.length, 1, "store B has only its own");
  assert.ok(listA.every((c) => c.storeId === storeA.id) && listB.every((c) => c.storeId === storeB.id));

  const miaA = await getCustomerByEmail(storeA.id, SHARED);
  const miaB = await getCustomerByEmail(storeB.id, SHARED);
  assert.notEqual(miaA.id, miaB.id, "the same address in two stores is two customers");
  assert.equal(miaA.orderCount, 4);
  assert.equal(miaB.orderCount, 1, "store B's record counts store B's order only");
  assert.equal(miaB.lifetimeSpend, 7000, "in store B's own currency");
  assert.equal(miaB.currency, "EUR");
  assert.equal(await getCustomer(storeB.id, miaA.id), null, "store A's customer id finds nothing in store B");
  assert.equal(await getCustomer(storeA.id, miaB.id), null);
  assert.equal((await listCustomerOrders(storeA.id, SHARED)).length, 4);
  assert.ok((await listCustomerOrders(storeB.id, SHARED)).every((o) => o.storeId === storeB.id));
  const exportB = await customerDataExport(storeB.id, miaB);
  assert.equal(exportB.orders.length, 1, "a data export holds that store's orders only");

  /* ---------------------------------------------------------- idempotence */

  assert.equal(await addCustomerNote(storeA.id, miaA.id, { id: "note_1", body: "Prefers DHL", authorId: "u", authorName: "Check" }), true);
  assert.equal(
    await addCustomerNote(storeA.id, miaA.id, { id: "note_1", body: "Prefers DHL", authorId: "u", authorName: "Check" }),
    false,
    "a double submit lands once",
  );
  assert.equal(await addCustomerNote(storeB.id, miaA.id, { id: "note_2", body: "x", authorId: "u", authorName: "Check" }), false, "notes cannot cross stores");
  await syncStoreCustomers(storeA);
  await syncStoreCustomers(storeA);
  const again = await listCustomers(storeA.id);
  assert.equal(again.length, 2, "re-running the backfill creates nothing new");
  const miaAgain = await getCustomer(storeA.id, miaA.id);
  assert.equal(miaAgain.id, miaA.id, "the record keeps its id");
  assert.equal(miaAgain.notes.length, 1, "and its notes");
  assert.equal(miaAgain.lifetimeSpend, miaA.lifetimeSpend);

  /* -------------------------------------------------------- anonymisation */

  const campaignId = `${RUN}_cmp`;
  await db.insertOne("gift_campaigns", {
    id: campaignId,
    storeId: storeA.id,
    code: `${RUN}-GC`,
    recipients: [
      { id: "r1", name: "Mia Fischer", email: SHARED, line1: "Lindenstraße 4", city: "Berlin", postalCode: "10115", country: "DE", note: "Happy birthday Mia", orderId: ordersA[0].id },
      { id: "r2", name: "Ola Nordmann", email: "ola@example.com", line1: "Gate 1", city: "Oslo", postalCode: "0150", country: "NO", note: "", orderId: ordersA[4].id },
    ],
  });
  await db.insertOne("audit_logs", {
    id: `${RUN}_aud`, storeId: storeA.id, category: "email", action: "email.logged",
    summary: `Logged the order confirmation email to ${SHARED}`, meta: { to: SHARED }, at: "2026-03-01T10:00:00.000Z",
  });

  const { orders: blanked } = await anonymiseCustomer(storeA, miaAgain);
  assert.equal(blanked, 4);
  const anonymous = anonymisedEmail(miaA.id);
  const gone = await getCustomer(storeA.id, miaA.id);
  assert.equal(gone.email, anonymous);
  assert.equal(gone.name, "");
  assert.ok(gone.anonymisedAt);
  assert.equal(gone.lifetimeSpend, miaA.lifetimeSpend, "amounts are kept for the accounts");
  assert.equal(gone.orderCount, 4);
  assert.equal(await getCustomerByEmail(storeA.id, SHARED), null, "nothing is filed under the old address");
  assert.equal((await listCustomers(storeA.id)).length, 2, "no second record appears");

  const after = await db.find("orders", { storeId: storeA.id, id: { $in: ordersA.slice(0, 4).map((o) => o.id) } });
  for (const o of after) {
    assert.deepEqual(
      [o.customer.name, o.customer.email, o.customer.line1, o.customer.city, o.customer.postalCode],
      ["", anonymous, "", "", ""],
      "name, email and address are gone from the order",
    );
    assert.equal(o.customer.country, "DE", "the country stays for tax records");
    const before = ordersA.find((x) => x.id === o.id);
    assert.equal(o.total, before.total, "the total is kept");
    assert.deepEqual(o.refunds.map((r) => r.amount), before.refunds.map((r) => r.amount), "refunds are kept");
  }
  const campaign = await db.findOne("gift_campaigns", { id: campaignId });
  assert.deepEqual([campaign.recipients[0].name, campaign.recipients[0].email, campaign.recipients[0].note], ["", anonymous, ""]);
  assert.equal(campaign.recipients[1].name, "Ola Nordmann", "other recipients are untouched");
  const audit = await db.findOne("audit_logs", { id: `${RUN}_aud` });
  assert.equal(audit.meta.to, anonymous);
  assert.ok(!audit.summary.includes(SHARED), "the address is gone from the email history");

  const exported = JSON.stringify(await customerDataExport(storeA.id, gone));
  assert.ok(!/mia/i.test(exported) && !exported.includes("Lindenstra"), "nothing personal is left to export");

  const untouched = await getCustomer(storeB.id, miaB.id);
  assert.equal(untouched.email, "mia.fischer@example.com", "store B keeps its customer");
  assert.equal(untouched.name, "Mia Fischer");
  const orderB = await db.findOne("orders", { id: ordersB[0].id });
  assert.equal(orderB.customer.email, SHARED, "and store B's orders are untouched");

  const repeat = await anonymiseCustomer(storeA, gone);
  assert.equal(repeat.orders, 0, "deleting again changes nothing");
  await syncStoreCustomers(storeA);
  assert.equal((await getCustomer(storeA.id, miaA.id)).anonymisedAt, gone.anonymisedAt, "the backfill keeps the deletion");
  assert.equal((await listCustomers(storeA.id)).length, 2);
} finally {
  await db.deleteMany("orders", { storeId: { $in: [storeA.id, storeB.id] } });
  await db.deleteMany("customers", { storeId: { $in: [storeA.id, storeB.id] } });
  await db.deleteMany("gift_campaigns", { storeId: storeA.id });
  await db.deleteMany("audit_logs", { storeId: storeA.id });
}

/* ------------------------------------------------------------ the list */

const now = new Date("2026-10-01T00:00:00.000Z");
function customer(overrides) {
  return {
    id: overrides.email,
    storeId: "s",
    name: "",
    country: "DE",
    firstOrderAt: "2026-01-01T00:00:00.000Z",
    lastOrderAt: "2026-01-01T00:00:00.000Z",
    orderCount: 1,
    lifetimeSpend: 1000,
    refundedTotal: 0,
    refundCount: 0,
    currency: "USD",
    preferredLanguage: "en",
    preferredCurrency: "USD",
    notes: [],
    anonymisedAt: null,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}
const list = [
  customer({ email: "ada@example.com", name: "Ada Lovelace", country: "GB", lastOrderAt: "2026-09-20T00:00:00.000Z", lifetimeSpend: 5000, orderCount: 3 }),
  customer({ email: "bo@example.com", name: "Bo Svensson", country: "SE", refundCount: 1, refundedTotal: 200, lifetimeSpend: 800 }),
  customer({ email: "cy@example.com", name: "Cyrus", country: "GB", lastOrderAt: "2026-08-01T00:00:00.000Z", lifetimeSpend: 2000 }),
];

{
  const defaults = parseCustomerFilters({});
  assert.deepEqual([defaults.sort, defaults.dir, defaults.page], ["lastOrder", "desc", 1]);
  assert.deepEqual(filterCustomers(list, defaults, now).map((c) => c.email), ["ada@example.com", "cy@example.com", "bo@example.com"]);
  assert.deepEqual(filterCustomers(list, parseCustomerFilters({ q: "SVENS" }), now).map((c) => c.email), ["bo@example.com"], "search by name");
  assert.deepEqual(filterCustomers(list, parseCustomerFilters({ q: "cy@" }), now).map((c) => c.email), ["cy@example.com"], "search by email");
  assert.equal(filterCustomers(list, parseCustomerFilters({ country: "gb" }), now).length, 2);
  assert.equal(parseCustomerFilters({ country: "all" }).country, null);
  assert.deepEqual(filterCustomers(list, parseCustomerFilters({ refunds: "1" }), now).map((c) => c.email), ["bo@example.com"]);
  assert.deepEqual(filterCustomers(list, parseCustomerFilters({ recent: "1" }), now).map((c) => c.email), ["ada@example.com", "cy@example.com"], "the last 90 days");
  assert.deepEqual(filterCustomers(list, parseCustomerFilters({ sort: "spend" }), now).map((c) => c.lifetimeSpend), [5000, 2000, 800]);
  assert.deepEqual(filterCustomers(list, parseCustomerFilters({ sort: "name" }), now).map((c) => c.name), ["Ada Lovelace", "Bo Svensson", "Cyrus"], "names A to Z first");
  assert.deepEqual(filterCustomers(list, parseCustomerFilters({ sort: "orders", dir: "asc" }), now)[2].email, "ada@example.com");
  assert.equal(parseCustomerFilters({ sort: "nonsense" }).sort, "lastOrder");

  const filters = parseCustomerFilters({ q: "a", country: "GB", refunds: "1", sort: "spend", dir: "asc", page: "2" });
  assert.equal(customerListQuery(filters), "?q=a&country=GB&refunds=1&sort=spend&dir=asc&page=2");
  assert.equal(customerListQuery(defaults), "", "defaults stay out of the address");
  assert.deepEqual(parseCustomerFilters(Object.fromEntries(new URLSearchParams(customerListQuery(filters).slice(1)))), filters, "round trip");

  const many = Array.from({ length: 30 }, (_, i) => customer({ email: `c${String(i).padStart(2, "0")}@x.com` }));
  const second = pageCustomers(filterCustomers(many, defaults, now), 2);
  assert.deepEqual([second.page, second.pages, second.first, second.last, second.customers.length], [2, 2, 26, 30, 5]);
  assert.equal(pageCustomers([], 3).first, 0);

  const csv = customerCsv([list[0], customer({ email: anonymisedEmail("cus_x"), anonymisedAt: "2026-09-01T00:00:00.000Z" })], {
    country: (code) => ({ GB: "United Kingdom", DE: "Germany" })[code] ?? code,
  });
  const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
  assert.equal(lines.length, 3);
  assert.equal(lines[1], "Ada Lovelace,ada@example.com,United Kingdom,2026-01-01T00:00:00.000Z,2026-09-20T00:00:00.000Z,3,USD,50.00,0.00,en,USD");
  assert.ok(lines[2].startsWith("Deleted customer,,Germany"), "a deleted customer exports without the placeholder address");
  assert.equal(customerFileName("Northwind Supply Co customers", filters, "2026-10-11"), "northwind-supply-co-customers-gb-refunds-2026-10-11.csv");
}

console.log("customers-check: all assertions passed");
process.exit(0);

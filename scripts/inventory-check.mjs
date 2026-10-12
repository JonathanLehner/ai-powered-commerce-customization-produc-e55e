// Self-check for inventory tracking: npm run inventory-check
//
// Runs the real stock writes against throwaway records in the development
// database, and asserts that:
// - the rules: what can be sold, the low-stock state, what a shopper is told,
//   and how an inventory CSV is read;
// - two shoppers cannot buy the last unit: of many checkouts reserving it at
//   once exactly one gets it, and "continue selling" lets it go below zero;
// - checkout.session.completed takes the reserved units off hand once, logged
//   as a sale, however often Stripe delivers it;
// - checkout.session.expired, and cancelling an unpaid order by hand, give the
//   held units back once;
// - a refund puts the units back on hand only when "restock" is ticked, and
//   only once per order;
// - a stock change that crosses the low-stock threshold notifies the team.
//
// No request reaches Stripe. It needs MONGODB_URI and MONGODB_DB from
// `.env.local`, and refuses to run against production.
import assert from "node:assert/strict";
import Stripe from "stripe";
import { PRODUCTION_DB } from "./mongo.mjs";

if (!process.env.MONGODB_DB || process.env.MONGODB_DB === PRODUCTION_DB) {
  console.error("inventory-check writes test data: set MONGODB_DB to the development database (see .env.local).");
  process.exit(1);
}
process.env.STRIPE_SECRET_KEY = "sk_test_inventory_check";
const CONNECT_SECRET = "whsec_inventory_check_connect";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_inventory_check_platform";
process.env.STRIPE_CONNECT_WEBHOOK_SECRET = CONNECT_SECRET;
delete process.env.RESEND_API_KEY;
globalThis.fetch = async (url) => {
  throw new Error(`inventory-check makes no network calls (${url})`);
};

const rules = await import("../src/lib/inventory-rules.ts");
const { db } = await import("../src/lib/mongo.ts");
const { COLLECTIONS } = await import("../src/lib/data.ts");
const inventory = await import("../src/lib/inventory.ts");
const { handleStripeWebhook } = await import("../src/lib/stripe-webhook.ts");
const { confirmOrderPayment } = await import("../src/lib/order-payment.ts");
const { moveOrder, refundOrder } = await import("../src/lib/operations/orders.ts");

// Outside a Next request, the confirmation email's lookups log errors the
// payment path deliberately rides over; they are not what is checked.
const quiet = console.error;
console.error = () => {};

/* ------------------------------------------------------------- the rules */

const settings = { lowStockThreshold: 3, showLowStock: true };
const level = (onHand, committed = 0, extra = {}) => ({ tracked: true, policy: "deny", onHand, committed, ...extra });
assert.equal(rules.canSell(null), true, "an untracked variant always sells");
assert.equal(rules.canSell(level(0, 0, { tracked: false })), true);
assert.equal(rules.canSell(level(1)), true);
assert.equal(rules.canSell(level(1, 1)), false, "units held by a checkout are not available");
assert.equal(rules.canSell(level(1), 2), false);
assert.equal(rules.canSell(level(0, 0, { policy: "continue" }), 5), true, "continue selling sells at zero");
assert.equal(rules.stockState(level(10), settings), "in_stock");
assert.equal(rules.stockState(level(3), settings), "low");
assert.equal(rules.stockState(level(0), settings), "out");
assert.equal(rules.stockState(null, settings), "untracked");
assert.deepEqual(rules.shopperStock(level(2), settings), { soldOut: false, left: 2 }, "only N left below the threshold");
assert.deepEqual(rules.shopperStock(level(2), { ...settings, showLowStock: false }), { soldOut: false, left: null });
assert.deepEqual(rules.shopperStock(level(0), settings), { soldOut: true, left: null }, "sold out");
assert.deepEqual(rules.shopperStock(level(0, 0, { policy: "continue" }), settings), { soldOut: false, left: null });
assert.equal(rules.crossedLow(4, 3, settings), true);
assert.equal(rules.crossedLow(3, 2, settings), false, "already low: no second warning");
assert.deepEqual(
  rules.stockLines([
    { storeProductId: "p", variantId: "v", quantity: 1 },
    { storeProductId: "p", variantId: "v", quantity: 2 },
  ]),
  [{ productId: "p", variantId: "v", quantity: 3 }],
  "personalised lines of one variant are held together",
);
assert.equal(rules.inventorySettings({}).lowStockThreshold, 5, "a store without settings uses the default");

const csvRows = [
  { productId: "p1", variantId: "v1", sku: "TEE-S", committed: 2 },
  { productId: "p1", variantId: "v2", sku: "TEE-M", committed: 0 },
];
const parsed = rules.parseInventoryCsv(
  "﻿variant_id,sku,tracked,policy,on_hand\r\nv1,,yes,deny,10\r\n,tee-m,,continue,\r\nnope,,yes,,1\r\nv2,,maybe,,\r\nv2,,,,1.5\r\n",
  csvRows,
);
assert.deepEqual(parsed.changes, [
  { line: 2, productId: "p1", variantId: "v1", tracked: true, policy: "deny", available: 8 },
  { line: 3, productId: "p1", variantId: "v2", policy: "continue" },
], "on_hand is read as available after what checkouts hold; blank cells change nothing; SKU matches");
assert.deepEqual(parsed.problems.map((p) => [p.line, p.code]), [[4, "unknownVariant"], [5, "badTracked"], [6, "badQuantity"]]);
const exported = rules.inventoryCsvRows([
  { productId: "p1", productName: "Tee", productStatus: "published", variantId: "v1", variantName: "S", sku: "TEE-S", enabled: true, tracked: true, policy: "deny", onHand: 5, committed: 1, available: 4, state: "in_stock" },
]);
assert.deepEqual(rules.parseInventoryCsv(exported.map((r) => r.join(",")).join("\n"), csvRows).changes[0].available, 4, "an export imports back unchanged");

/* ------------------------------------------------------------ the dataset */

const RUN = `inv${Date.now().toString(36)}`;
const ACCOUNT = `acct_${RUN}`;
const template = await db.findOne(COLLECTIONS.stores, { id: "str_rivet" });
assert.ok(template, "the seeded rivet-hardware store is in the development database (npm run seed)");
const productTemplate = await db.findOne(COLLECTIONS.storeProducts, { storeId: "str_rivet" });
const orderTemplate = await db.findOne(COLLECTIONS.orders, { storeId: "str_rivet", "campaign.campaignId": { $exists: false } });
assert.ok(productTemplate && orderTemplate, "the seeded store has a product and an order to copy");

const store = {
  ...template,
  id: `str_${RUN}`,
  slug: `inventory-check-${RUN}`,
  customDomain: null,
  demo: false,
  inventory: { lowStockThreshold: 0, showLowStock: false },
  stripe: { connected: true, express: true, accountId: ACCOUNT, country: "US", chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, connectedAt: new Date().toISOString() },
};
delete store._id;
const product = { ...productTemplate, id: `sp_${RUN}`, storeId: store.id, slug: `tee-${RUN}` };
delete product._id;
const variant = product.variants[0];
const actor = { id: "usr_inventory_check", name: "Inventory Check" };
const ctx = { store, actor, locale: "en" };
const label = { productName: product.name, variantName: variant.name, sku: variant.sku };
const target = { productId: product.id, variantId: variant.id, label };
const line = [{ storeProductId: product.id, variantId: variant.id, quantity: 1 }];

await db.insertOne(COLLECTIONS.stores, store);
await db.insertOne(COLLECTIONS.storeProducts, product);

let orders = 0;
async function makeOrder(extra = {}) {
  orders += 1;
  const order = {
    ...orderTemplate,
    id: `ord_${RUN}_${orders}`,
    storeId: store.id,
    code: `INV-${RUN.toUpperCase()}-${orders}`,
    status: "awaiting_payment",
    currency: store.defaultCurrency,
    items: [{ ...orderTemplate.items[0], storeProductId: product.id, variantId: variant.id, productName: product.name, variantName: variant.name, quantity: 1 }],
    total: 5000,
    discount: null,
    refunds: [],
    events: [],
    payment: { provider: "stripe", status: "requires_payment", paymentIntentId: null, stripeAccountId: ACCOUNT, last4: null, failureMessage: null, paidAt: null, checkoutSessionId: `cs_test_${RUN}_${orders}` },
    fulfillment: { supplierId: null, supplierName: null, routing: "pending", supplierOrderRef: null, submittedAt: null, submissionMessage: null, carrier: null, trackingNumber: null, trackingUrl: null, exception: null },
    cartId: null,
    campaign: null,
    idempotencyKey: `idem_${RUN}_${orders}`,
    ...extra,
  };
  delete order._id;
  await db.insertOne(COLLECTIONS.orders, order);
  return order;
}
const reload = (id) => db.findOne(COLLECTIONS.orders, { id });
const stock = () => inventory.getLevel(product.id, variant.id);

let events = 0;
async function deliver(type, order) {
  events += 1;
  const payload = JSON.stringify({
    id: `evt_${RUN}_${events}`,
    object: "event",
    api_version: "2026-09-30.endive",
    created: 1,
    livemode: false,
    type,
    account: ACCOUNT,
    data: {
      object: {
        id: order.payment.checkoutSessionId,
        object: "checkout.session",
        mode: "payment",
        status: type === "checkout.session.completed" ? "complete" : "expired",
        payment_status: type === "checkout.session.completed" ? "paid" : "unpaid",
        amount_total: order.total,
        currency: order.currency.toLowerCase(),
        payment_intent: type === "checkout.session.completed" ? `pi_${RUN}_${events}` : null,
        metadata: { kind: "order", orderId: order.id, storeId: store.id, code: order.code },
      },
    },
  });
  const signature = await Stripe.webhooks.generateTestHeaderStringAsync({
    payload,
    secret: CONNECT_SECRET,
    cryptoProvider: Stripe.createSubtleCryptoProvider(),
  });
  return handleStripeWebhook(payload, signature);
}

try {
  /* ------------------------------------- concurrent purchase of the last unit */

  await inventory.changeStock(store, target, { tracked: true, policy: "deny", available: 1, reason: "received" }, actor);
  assert.deepEqual(
    (({ tracked, policy, onHand, committed }) => ({ tracked, policy, onHand, committed }))(await stock()),
    { tracked: true, policy: "deny", onHand: 1, committed: 0 },
  );
  const attempts = await Promise.all(Array.from({ length: 12 }, () => inventory.reserveStock(line)));
  const winners = attempts.filter((a) => a.ok);
  assert.equal(winners.length, 1, "of twelve checkouts for the last unit, exactly one holds it");
  assert.ok(attempts.filter((a) => !a.ok).every((a) => a.available === 0), "the others are told none are left");
  assert.equal((await stock()).committed, 1);
  assert.deepEqual(winners[0].inventory, { state: "reserved", lines: [{ productId: product.id, variantId: variant.id, quantity: 1 }] });
  assert.equal((await inventory.reserveStock(line)).ok, false, "a later shopper cannot have it either");

  /* -------------------------------------- completed payment takes it off hand */

  const paid = await makeOrder({ inventory: winners[0].inventory });
  assert.equal((await deliver("checkout.session.completed", paid)).body.outcome, "order_paid");
  assert.equal((await reload(paid.id)).inventory.state, "committed");
  let now = await stock();
  assert.deepEqual([now.onHand, now.committed], [0, 0], "the sold unit is gone from hand and no longer held");
  const sale = await db.find(COLLECTIONS.inventoryAdjustments, { storeId: store.id, reason: "sold" });
  assert.equal(sale.length, 1);
  assert.deepEqual([sale[0].delta, sale[0].onHandAfter, sale[0].reference], [-1, 0, paid.code], "the sale is in the history");
  assert.equal((await deliver("checkout.session.completed", paid)).body.outcome, "order_already_settled");
  now = await stock();
  assert.deepEqual([now.onHand, now.committed], [0, 0], "a redelivered completion takes nothing more");

  /* ------------------------------------------- expiry gives the unit back */

  await inventory.changeStock(store, target, { available: 1, reason: "received" }, actor);
  const held = await inventory.reserveStock(line);
  assert.equal(held.ok, true);
  const abandoned = await makeOrder({ inventory: held.inventory });
  assert.equal((await inventory.reserveStock(line)).ok, false, "held while the shopper is on Stripe Checkout");
  assert.equal((await deliver("checkout.session.expired", abandoned)).body.outcome, "order_closed");
  const closed = await reload(abandoned.id);
  assert.deepEqual([closed.status, closed.inventory.state], ["cancelled", "released"]);
  now = await stock();
  assert.deepEqual([now.onHand, now.committed], [1, 0], "the unit is available again");
  await deliver("checkout.session.expired", abandoned);
  assert.equal((await stock()).committed, 0, "a redelivered expiry does not give it back twice");

  // Cancelling an unpaid order by hand releases it too.
  const second = await inventory.reserveStock(line);
  const cancelled = await makeOrder({ inventory: second.inventory });
  assert.equal(await moveOrder(ctx, cancelled, "cancelled"), true);
  assert.equal((await reload(cancelled.id)).inventory.state, "released");
  assert.equal((await stock()).committed, 0, "a cancelled checkout gives the unit back");

  /* ------------------------------------------------ continue selling oversells */

  await inventory.changeStock(store, target, { policy: "continue", available: 0, reason: "correction" }, actor);
  const oversold = await inventory.reserveStock([{ ...line[0], quantity: 2 }]);
  assert.equal(oversold.ok, true, "continue selling takes orders at zero");
  await inventory.releaseLines(oversold.inventory.lines);
  assert.equal((await stock()).committed, 0);

  /* ------------------------------------------------------ restock on refund */

  await inventory.changeStock(store, target, { policy: "deny", available: 2, reason: "received" }, actor);
  const demoHeld = await inventory.reserveStock([{ ...line[0], quantity: 2 }]);
  const refunded = await makeOrder({
    inventory: demoHeld.inventory,
    items: [{ ...orderTemplate.items[0], storeProductId: product.id, variantId: variant.id, productName: product.name, variantName: variant.name, quantity: 2 }],
    payment: { provider: "stripe", status: "requires_payment", paymentIntentId: null, stripeAccountId: null, last4: null, failureMessage: null, paidAt: null },
  });
  assert.equal(
    await confirmOrderPayment(refunded, store, { paymentIntentId: `pi_${RUN}_demo`, last4: "4242", note: "Demo payment." }),
    true,
  );
  now = await stock();
  assert.deepEqual([now.onHand, now.committed], [0, 0]);

  let current = await reload(refunded.id);
  let result = await refundOrder(ctx, current, { amount: 100, reason: "Partial goodwill refund", cancel: false, restock: false });
  assert.equal(result.restocked, false);
  assert.equal((await stock()).onHand, 0, "a refund without restock leaves stock alone");

  current = await reload(refunded.id);
  result = await refundOrder(ctx, current, { amount: 100, reason: "Returned unworn", cancel: false, restock: true });
  assert.equal(result.restocked, true);
  assert.equal((await stock()).onHand, 2, "restock puts both units back on hand");
  const restock = await db.find(COLLECTIONS.inventoryAdjustments, { storeId: store.id, reason: "restock" });
  assert.deepEqual([restock.length, restock[0].delta, restock[0].actorName], [1, 2, actor.name], "the restock is in the history, under who did it");

  current = await reload(refunded.id);
  result = await refundOrder(ctx, current, { amount: 100, reason: "Second refund", cancel: true, restock: true });
  assert.equal(result.restocked, false, "an order is restocked once");
  assert.equal((await stock()).onHand, 2);

  /* ------------------------------------------------- low-stock notification */

  await db.updateOne(COLLECTIONS.stores, { id: store.id }, { $set: { inventory: { lowStockThreshold: 5, showLowStock: true } } });
  const lowStore = { ...store, inventory: { lowStockThreshold: 5, showLowStock: true } };
  // Selling out above crossed the threshold of zero; those warnings are already written.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const earlier = await db.count(COLLECTIONS.audit, { storeId: store.id, action: "inventory.low_stock" });
  assert.ok(earlier >= 1, "selling the last unit warns at a threshold of zero");
  await inventory.changeStock(lowStore, target, { available: 10, reason: "received" }, actor);
  await inventory.changeStock(lowStore, target, { available: 4, reason: "damaged" }, actor);
  await inventory.changeStock(lowStore, target, { available: 3, reason: "damaged" }, actor);
  // recordAudit writes after the response; outside a request it runs on its own.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const warnings = await db.find(COLLECTIONS.audit, { storeId: store.id, action: "inventory.low_stock", "meta.threshold": 5 });
  assert.equal(warnings.length, 1, "crossing the threshold warns once, not on every change below it");
  assert.equal(warnings[0].meta.available, 4);
  assert.ok(
    (await db.count(COLLECTIONS.notifications, { storeId: store.id, type: "low_stock" })) > 0,
    "the store's team is notified",
  );

  const history = await inventory.listAdjustments(store.id);
  assert.ok(history.every((entry) => entry.actorName && entry.at && Number.isInteger(entry.delta) && entry.reason), "every entry says who, when, delta and why");
} finally {
  await Promise.all([
    db.deleteMany(COLLECTIONS.stores, { id: store.id }),
    db.deleteMany(COLLECTIONS.storeProducts, { storeId: store.id }),
    db.deleteMany(COLLECTIONS.orders, { storeId: store.id }),
    db.deleteMany(COLLECTIONS.inventoryLevels, { storeId: store.id }),
    db.deleteMany(COLLECTIONS.inventoryAdjustments, { storeId: store.id }),
    db.deleteMany(COLLECTIONS.audit, { storeId: store.id }),
    db.deleteMany(COLLECTIONS.notifications, { storeId: store.id }),
    db.deleteMany(COLLECTIONS.customers, { storeId: store.id }),
    db.deleteMany(COLLECTIONS.stripeEvents, { id: { $regex: `^evt_${RUN}_` } }),
  ]);
  console.error = quiet;
}

console.log("inventory-check ok: the last unit sells once, expiry and cancellation release, refunds restock once");
process.exit(0);

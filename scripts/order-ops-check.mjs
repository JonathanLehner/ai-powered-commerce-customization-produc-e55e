// Self-check for order operations and abandoned checkouts: npm run order-ops-check
//
// The rules first, without a database: what has shipped and what is left,
// which units a parcel may hold, when the address can change, how tags are
// cleaned, and when a recovery email is due. Then the real operations against
// throwaway orders in the development database, with Stripe never called (the
// orders are on simulated payments) and the store's webhook endpoint answered
// in memory.
//
// It asserts that:
// - a parcel can hold part of an order, line by line, never more than is left;
//   the order is shipped only once nothing is left, and each parcel is emailed
//   to the shopper with its tracking link;
// - the shipping address can be corrected until the first parcel leaves;
// - notes and tags are kept, cleaned, and never shown to the shopper;
// - partial and full refunds are recorded against the payment, never past the
//   total, with order.refunded and order.fulfilled sent to webhooks;
// - a Checkout session that expires unpaid becomes an abandoned checkout, one
//   replaced by the shopper does not, and paying later marks it recovered;
// - one recovery email goes out per checkout, after the delay, only with the
//   shopper's consent and only for checkouts abandoned since it was turned on;
// - the restore link puts the still-available lines back in the basket;
// - every new email renders in every language, and the shopper's order page
//   says "Partially shipped".
//
// It needs MONGODB_URI and MONGODB_DB from `.env.local`, and refuses to run against production.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LOCALES } from "../src/i18n/locales.ts";
import { PRODUCTION_DB } from "./mongo.mjs";
import { emailCopyFor, shopperT } from "./shopper-intl.mjs";

if (!process.env.MONGODB_DB || process.env.MONGODB_DB === PRODUCTION_DB) {
  console.error("order-ops-check writes test data: set MONGODB_DB to the development database (see .env.local).");
  process.exit(1);
}

/* ------------------------------------------------------------- pure rules */

const rules = await import("../src/lib/order-ops.ts");

assert.deepEqual(rules.normaliseTags(" VIP,  gift   wrap , vip, ,Wholesale"), ["VIP", "gift wrap", "Wholesale"]);
assert.deepEqual(rules.normaliseTags(["a", 3, "A", "b"]), ["a", "b"]);
assert.equal(rules.normaliseTags(["x".repeat(80)])[0].length, rules.MAX_TAG_LENGTH);

const items = [
  { id: "a", quantity: 3 },
  { id: "b", quantity: 1 },
  { id: "g", quantity: 1 },
];
const gift = new Set(["g"]);
const fresh = { status: "in_production", items, shipments: [] };
assert.equal(rules.fulfilmentState(fresh, gift), "unfulfilled");
assert.deepEqual([...rules.remainingQuantities(fresh, gift)], [["a", 3], ["b", 1]], "gift cards are never in a parcel");
assert.deepEqual([...rules.shippedQuantities({ status: "shipped", items })], [["a", 3], ["b", 1], ["g", 1]], "shipped before parcels were recorded: all of it");
assert.equal(rules.remainingQuantities({ status: "delivered", items }).size, 0);

let plan = rules.planShipment(fresh, [{ itemId: "a", quantity: 2 }, { itemId: "b", quantity: 0 }], gift);
assert.ok(plan.ok && !plan.complete);
assert.deepEqual(plan.lines, [{ itemId: "a", quantity: 2 }], "lines with nothing to ship are dropped");
const partly = { ...fresh, shipments: [{ lines: plan.lines }] };
assert.equal(rules.fulfilmentState(partly, gift), "partial");
assert.deepEqual(rules.planShipment(partly, [{ itemId: "a", quantity: 2 }], gift), { ok: false, problem: "tooMany", itemId: "a" });
assert.deepEqual(rules.planShipment(partly, [{ itemId: "a", quantity: 1.5 }], gift), { ok: false, problem: "tooMany", itemId: "a" });
assert.deepEqual(rules.planShipment(partly, [{ itemId: "a", quantity: -1 }], gift), { ok: false, problem: "tooMany", itemId: "a" });
assert.deepEqual(rules.planShipment(partly, [{ itemId: "g", quantity: 1 }], gift), { ok: false, problem: "unknownLine", itemId: "g" });
assert.deepEqual(rules.planShipment(partly, [{ itemId: "zz", quantity: 1 }], gift), { ok: false, problem: "unknownLine", itemId: "zz" });
assert.deepEqual(rules.planShipment(partly, [], gift), { ok: false, problem: "nothingSelected" });
plan = rules.planShipment(partly, [{ itemId: "b", quantity: 1 }, { itemId: "a", quantity: 1 }], gift);
assert.ok(plan.ok && plan.complete, "the last units complete the order");
assert.deepEqual(plan.lines.map((l) => l.itemId), ["a", "b"], "in the order's own line order");
assert.deepEqual(rules.planShipment(partly, null, gift).lines, [{ itemId: "a", quantity: 1 }, { itemId: "b", quantity: 1 }]);
assert.deepEqual(rules.planShipment({ ...fresh, status: "shipped", shipments: [{ lines: [{ itemId: "a", quantity: 3 }, { itemId: "b", quantity: 1 }] }] }, null, gift), {
  ok: false,
  problem: "nothingLeft",
});

for (const status of ["paid", "in_production", "exception", "shipped"]) assert.ok(rules.canShip({ status }), `${status} can ship`);
for (const status of ["awaiting_payment", "cancelled", "delivered"]) assert.ok(!rules.canShip({ status }), `${status} cannot ship`);

const customer = { anonymisedAt: undefined };
assert.ok(rules.canEditAddress({ ...fresh, customer }));
assert.ok(!rules.canEditAddress({ ...partly, customer }), "not once a parcel has left");
assert.ok(!rules.canEditAddress({ ...fresh, status: "cancelled", customer }));
assert.ok(!rules.canEditAddress({ ...fresh, customer: { anonymisedAt: "2026-01-01" } }));

const address = { name: "Ada Lovelace", line1: "1 Main Street", line2: "", city: "Springfield", region: "", postalCode: "12345", country: "de", phone: "" };
assert.deepEqual(rules.readAddress(address), {
  ok: true,
  address: { name: "Ada Lovelace", line1: "1 Main Street", city: "Springfield", postalCode: "12345", country: "DE" },
});
assert.deepEqual(rules.readAddress({ ...address, country: "US" }), { ok: false, field: "region" }, "a US address needs a state");
assert.equal(rules.readAddress({ ...address, country: "US", region: "IL" }).address.region, "IL");
assert.deepEqual(rules.readAddress({ ...address, region: "Bavaria" }).address.region, undefined, "no region line where the country has none");
assert.deepEqual(rules.readAddress({ ...address, country: "XX" }), { ok: false, field: "country" });
assert.deepEqual(rules.readAddress({ ...address, phone: "call me" }), { ok: false, field: "phone" });
assert.deepEqual(rules.readAddress({ ...address, name: "A" }), { ok: false, field: "name" });

// Recovery emails.
const now = new Date("2026-03-10T12:00:00Z");
const hoursAgo = (h) => new Date(now.getTime() - h * 3_600_000).toISOString();
const settings = { enabled: true, delayHours: 10, enabledAt: hoursAgo(48) };
const abandonedAt = (h, extra = {}) => ({
  marketingConsent: true,
  customer: {},
  abandoned: { at: hoursAgo(h), recoveryEmailAt: null, recoveredAt: null },
  ...extra,
});
assert.ok(rules.recoveryDue(abandonedAt(11), settings, now), "due after the delay");
assert.ok(!rules.recoveryDue(abandonedAt(9), settings, now), "not before it");
assert.equal(rules.recoveryState(abandonedAt(9), settings, now), "scheduled");
assert.equal(rules.recoveryState(abandonedAt(11, { marketingConsent: false }), settings, now), "noConsent");
assert.ok(!rules.recoveryDue(abandonedAt(11, { marketingConsent: undefined }), settings, now), "consent is never assumed");
assert.equal(rules.recoveryState(abandonedAt(72), settings, now), "off", "abandoned before it was turned on");
assert.equal(rules.recoveryState(abandonedAt(11), { ...settings, enabled: false }, now), "off");
assert.equal(rules.recoveryState(abandonedAt(24 * 8), { ...settings, enabledAt: hoursAgo(24 * 30) }, now), "expired");
assert.equal(rules.recoveryState({ ...abandonedAt(11), abandoned: { at: hoursAgo(11), recoveryEmailAt: hoursAgo(1), recoveredAt: null } }, settings, now), "sent");
assert.equal(rules.recoveryState({ ...abandonedAt(11), abandoned: { at: hoursAgo(11), recoveryEmailAt: null, recoveredAt: hoursAgo(1) } }, settings, now), "recovered");
assert.equal(rules.recoveryState(abandonedAt(11, { customer: { anonymisedAt: hoursAgo(1) } }), settings, now), "noConsent");
assert.equal(rules.readDelayHours("10"), 10);
for (const bad of ["0", "73", "1.5", "", "ten"]) assert.equal(rules.readDelayHours(bad), null, `${bad} hours is refused`);

const { collapseRepeats, shopperTimeline } = await import("../src/lib/order-timeline.ts");
// Identical steps fold into one entry at their latest place, with a count.
const sent = { status: "Sent to supplier", note: "PO 1", actor: "Ada" };
const flagged = { status: "Exception raised", note: "Out of region", actor: "Ada" };
const folded = collapseRepeats([
  { status: "Payment captured", note: "", actor: "Stripe", at: "1" },
  { ...sent, at: "2" },
  { ...flagged, at: "3" },
  { ...sent, at: "4" },
  { ...flagged, at: "5" },
  { ...flagged, note: "Other", at: "6" },
]);
assert.deepEqual(
  folded.map((e) => [e.status, e.count, e.firstAt, e.at]),
  [
    ["Payment captured", 1, "1", "1"],
    ["Sent to supplier", 2, "2", "4"],
    ["Exception raised", 2, "3", "5"],
    ["Exception raised", 1, "6", "6"],
  ],
);

assert.deepEqual(
  shopperTimeline([
    { status: "Payment captured", at: "1" },
    { status: "Partially shipped", at: "2" },
    { status: "Partially shipped", at: "3" },
    { status: "Shipped", at: "4" },
  ]).map((e) => e.milestone),
  ["paid", "partiallyShipped", "shipped"],
);

// Every new email and storefront line, in every language.
const templates = await import("../src/lib/email-templates.ts");
const brand = { storeName: "Northwind", clientName: "Northwind Co", logoUrl: null, supportEmail: "help@example.com" };
for (const locale of LOCALES) {
  const copy = emailCopyFor(locale);
  const partial = templates.shippingNotificationEmail(brand, copy, {
    customerName: "Ada",
    code: "ORD-1",
    carrierName: "DHL Express",
    trackingNumber: "JD0000000001",
    trackingUrl: "https://track.example.com/JD0000000001",
    statusUrl: "https://shop.example.com/orders/ORD-1",
    partialItems: [{ name: "Mug", quantity: 2 }],
  });
  const recovery = templates.checkoutRecoveryEmail(brand, copy, {
    customerName: "Ada",
    items: [{ name: "Mug", variant: "White", quantity: 2 }],
    restoreUrl: "https://shop.example.com/cart/restore?o=ord_1&t=x",
  });
  for (const email of [partial, recovery]) {
    assert.ok(!/storefront\.|email\.\w+|\{\w+\}/.test(email.subject + email.text), `${locale}: no raw keys or placeholders`);
    assert.ok(email.subject.includes("ORD-1") || email.subject.includes("Northwind"), `${locale}: the subject names the order or store`);
  }
  assert.ok(partial.html.includes("ORD-1") && partial.text.includes("JD0000000001") && partial.text.includes("Mug"), `${locale}: the parcel's contents`);
  assert.ok(recovery.html.includes("cart/restore") && recovery.text.includes("Mug · White"), `${locale}: the restore link and items`);
  assert.ok(recovery.text.includes(shopperT(locale, "email")("recoveryConsent", { store: "Northwind" })), `${locale}: why they receive it`);
  const status = shopperT(locale, "status");
  assert.ok(status("partiallyShipped") && status("partiallyShippedNote"));
  const slip = shopperT(locale, "packingSlip");
  assert.ok(slip("heading") && slip("thanks", { store: "x" }).includes("x"));
  assert.ok(shopperT(locale, "checkout")("marketingConsent"));
}

/* --------------------------------------------------------- against the db */

/** Webhook deliveries to the store's endpoint land here; nothing else may leave. */
const HOOK = "https://erp.example.com/parcelith";
const received = [];
let stray = 0;
globalThis.fetch = async (input, init = {}) => {
  if (String(input) !== HOOK) {
    stray += 1;
    throw new Error(`order-ops-check makes no network calls (${input})`);
  }
  received.push(JSON.parse(String(init.body)));
  return new Response("ok", { status: 200 });
};

const { db, mongoClient, mongoDatabaseName } = await import("../src/lib/mongo.ts");
const { ensureIndexes } = await import("../src/lib/db-indexes.ts");
await ensureIndexes((await mongoClient()).db(mongoDatabaseName()));
const { COLLECTIONS, getOrder } = await import("../src/lib/data.ts");
const orders = await import("../src/lib/operations/orders.ts");
const { abandonOrderPayment, confirmOrderPayment } = await import("../src/lib/order-payment.ts");
const recovery = await import("../src/lib/checkout-recovery.ts");
const hooks = await import("../src/lib/operations/webhooks.ts");
const { settleWebhookWork } = await import("../src/lib/webhooks.ts");

const quiet = { error: console.error, info: console.info };
console.error = () => {};
console.info = () => {};

const RUN = `ops${Date.now().toString(36)}`;
const template = (await db.findOne(COLLECTIONS.stores, { id: "str_northwind" })) ?? (await db.findOne(COLLECTIONS.stores, { status: "active" }));
assert.ok(template, "the development database has a store (npm run seed)");
const store = {
  ...template,
  id: `str_${RUN}`,
  slug: `order-ops-check-${RUN}`,
  status: "active",
  customDomain: null,
  domainHosts: [],
  carriers: [{ carrier: "dhl", enabled: true }, { carrier: "ups", enabled: false }],
  stripe: { ...template.stripe, connected: true, chargesEnabled: true },
  checkoutRecovery: null,
};
delete store._id;
await db.insertOne(COLLECTIONS.stores, store);
const ctx = () => ({ store, actor: { id: "usr_order_ops_check", name: "Order Ops Check" }, locale: "en" });
const refusal = async (promise) => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail("expected a refusal");
};
const settle = async () => {
  await settleWebhookWork();
  await new Promise((resolve) => setTimeout(resolve, 150));
};
const audits = (filter) => db.find(COLLECTIONS.audit, { storeId: store.id, ...filter });

const productId = `stp_${RUN}`;
await db.insertOne(COLLECTIONS.storeProducts, {
  id: productId,
  storeId: store.id,
  name: "Check mug",
  status: "published",
  variants: [{ id: "var_white", name: "White", enabled: true, price: 1500 }],
});

let seq = 0;
async function makeOrder(patch = {}) {
  seq += 1;
  const now = new Date().toISOString();
  const order = {
    id: `ord_${RUN}_${seq}`,
    storeId: store.id,
    code: `ORD-${RUN.toUpperCase()}-${seq}`,
    status: "in_production",
    currency: store.defaultCurrency,
    locale: "en",
    customer: { name: "Ada Lovelace", email: `ada-${RUN}@example.com`, line1: "1 Main Street", city: "Berlin", postalCode: "10115", country: "DE" },
    items: [
      { id: `oit_${seq}_a`, storeProductId: productId, variantId: "var_white", productName: "Check mug", variantName: "White", quantity: 3, unitPrice: 1500, supplierCost: 500, customization: { artworkUrl: null, artworkFileName: null, text: null, previewUrl: null }, supplierId: "" },
      { id: `oit_${seq}_b`, storeProductId: `stp_${RUN}_gone`, variantId: "v", productName: "Old tote", variantName: "Natural", quantity: 1, unitPrice: 2000, supplierCost: 900, customization: { artworkUrl: null, artworkFileName: null, text: null, previewUrl: null }, supplierId: "" },
    ],
    subtotal: 6500,
    shipping: 500,
    taxAmount: 0,
    taxRate: 0,
    total: 7000,
    payment: { provider: "stripe", status: "succeeded", paymentIntentId: `pi_${RUN}_${seq}`, stripeAccountId: null, last4: "4242", failureMessage: null, paidAt: now },
    fulfillment: { supplierId: null, supplierName: null, routing: "submitted", supplierOrderRef: "X-1", submittedAt: now, submissionMessage: null, carrier: null, trackingNumber: null, trackingUrl: null, exception: null },
    refunds: [],
    events: [{ at: now, status: "Payment captured", note: "", actor: "Stripe" }],
    idempotencyKey: null,
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
  await db.insertOne(COLLECTIONS.orders, order);
  return order;
}

try {
  await hooks.createEndpoint(ctx(), { url: HOOK, topics: ["order.fulfilled", "order.refunded", "order.cancelled", "order.created", "order.paid"] });

  /* ------------------------------------------------------- partial shipping */

  let order = await makeOrder();
  const [lineA, lineB] = order.items;
  const tooMany = await refusal(orders.fulfilOrder(ctx(), order, { carrier: "dhl", trackingNumber: "", lines: [{ itemId: lineA.id, quantity: 4 }] }));
  assert.equal(tooMany.field, `quantity_${lineA.id}`, "never more than is left of a line");
  assert.equal((await refusal(orders.fulfilOrder(ctx(), order, { carrier: "ups", trackingNumber: "", lines: null }))).field, "carrier", "only enabled carriers");

  const first = await orders.fulfilOrder(ctx(), order, { carrier: "dhl", trackingNumber: "JD014600006281", lines: [{ itemId: lineA.id, quantity: 2 }] });
  assert.equal(first.complete, false);
  order = await getOrder(order.id);
  assert.equal(order.status, "in_production", "a partial parcel leaves the status as it was");
  assert.equal(order.shipments.length, 1);
  assert.deepEqual(order.shipments[0].lines, [{ itemId: lineA.id, quantity: 2 }]);
  assert.equal(order.shipments[0].trackingUrl.includes("JD014600006281"), true, "with the carrier's tracking link");
  assert.equal(order.events.at(-1).status, "Partially shipped");
  assert.equal(rules.fulfilmentState(order), "partial");
  const stale = await refusal(orders.fulfilOrder(ctx(), { ...order, updatedAt: "2000-01-01" }, { carrier: "dhl", trackingNumber: "", lines: null }));
  assert.equal(stale.code, "conflict", "a parcel recorded from a stale page is refused");
  assert.equal((await refusal(orders.updateShippingAddress(ctx(), order, address))).code, "conflict", "the address is fixed once a parcel left");

  const rest = await orders.fulfilOrder(ctx(), order, { carrier: "dhl", trackingNumber: "", lines: null });
  assert.equal(rest.complete, true);
  order = await getOrder(order.id);
  assert.equal(order.status, "shipped", "shipped once nothing is left");
  assert.equal(order.shipments.length, 2);
  assert.deepEqual(order.shipments[1].lines, [{ itemId: lineA.id, quantity: 1 }, { itemId: lineB.id, quantity: 1 }]);
  assert.equal((await refusal(orders.fulfilOrder(ctx(), order, { carrier: "dhl", trackingNumber: "", lines: null }))).code, "conflict");
  await orders.shipOrder(ctx(), order, "dhl", "JD999999999999");
  order = await getOrder(order.id);
  assert.equal(order.shipments.length, 2, "re-tracking a shipped order adds no parcel");
  assert.equal(order.shipments[1].trackingNumber, "JD999999999999");
  await settle();
  const shippingEmails = await audits({ action: "email.logged", "meta.kind": "shipping notification", entityId: order.code });
  assert.equal(shippingEmails.length, 2, "one email per parcel, none for a tracking correction");
  assert.ok(shippingEmails.some((e) => e.meta.subject.startsWith("Part of your")), "the first says it is part of the order");
  assert.equal(received.filter((e) => e.type === "order.fulfilled" && e.data.id === order.id).length, 1, "order.fulfilled once, when the last parcel left");

  // An unpaid order cannot ship.
  const unpaid = await makeOrder({ status: "awaiting_payment", payment: { provider: "stripe", status: "requires_payment", paymentIntentId: null, stripeAccountId: null, last4: null, failureMessage: null, paidAt: null } });
  assert.equal((await refusal(orders.fulfilOrder(ctx(), unpaid, { carrier: "dhl", trackingNumber: "", lines: null }))).code, "conflict");

  /* ---------------------------------------------------- address, notes, tags */

  let open = await makeOrder({ status: "paid" });
  const usNoState = await refusal(orders.updateShippingAddress(ctx(), open, { ...address, country: "US" }));
  assert.equal(usNoState.field, "region");
  open = await orders.updateShippingAddress(ctx(), open, { ...address, country: "US", region: "IL", line2: "Apt 4" });
  const saved = await getOrder(open.id);
  assert.equal(saved.customer.country, "US");
  assert.equal(saved.customer.region, "IL");
  assert.equal(saved.customer.line2, "Apt 4");
  assert.equal(saved.customer.email, `ada-${RUN}@example.com`, "the email stays");
  assert.equal(saved.events.at(-1).status, "Shipping address updated");

  open = await orders.saveOrderNotes(ctx(), saved, { note: "  Call before delivery ", tags: "VIP, gift wrap, vip" });
  const noted = await getOrder(open.id);
  assert.equal(noted.note, "Call before delivery");
  assert.deepEqual(noted.tags, ["VIP", "gift wrap"]);
  const unchanged = await orders.saveOrderNotes(ctx(), noted, { note: "Call before delivery", tags: ["VIP", "gift wrap"] });
  assert.equal(unchanged.updatedAt, noted.updatedAt, "nothing changed, nothing written");
  assert.equal((await refusal(orders.saveOrderNotes(ctx(), noted, { tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }))).field, "tags");
  assert.equal((await refusal(orders.saveOrderNotes(ctx(), noted, { note: "x".repeat(rules.MAX_NOTE_LENGTH + 1) }))).field, "note");
  const { presentOrder } = await import("../src/lib/api/present.ts");
  assert.deepEqual(presentOrder(noted).tags, ["VIP", "gift wrap"], "the API returns them");
  const shopperPage = readFileSync(new URL("../src/app/s/[slug]/[locale]/orders/[code]/page.tsx", import.meta.url), "utf8");
  assert.ok(!/order\.note\b|order\.tags/.test(shopperPage), "the shopper's order page never shows notes or tags");
  assert.ok(shopperPage.includes('"partiallyShipped"'), "the shopper's page says when part of it has shipped");

  /* ---------------------------------------------------------------- refunds */

  let refundable = await makeOrder({ status: "paid" });
  const part = await orders.refundOrder(ctx(), refundable, { amount: 2500, reason: "Damaged mug", cancel: false });
  assert.ok(part.refundId, "the payment provider returned a refund id");
  refundable = await getOrder(refundable.id);
  assert.equal(refundable.payment.status, "succeeded", "a partial refund leaves the payment captured");
  assert.equal(refundable.refunds[0].reason, "Damaged mug");
  assert.equal((await refusal(orders.refundOrder(ctx(), refundable, { amount: 4600, reason: "Too much", cancel: false }))).field, "amount", "never past the total");
  assert.equal((await refusal(orders.refundOrder(ctx(), refundable, { amount: 100, reason: "", cancel: false }))).field, "reason", "a reason is required");
  await orders.refundOrder(ctx(), refundable, { amount: 4500, reason: "Customer cancelled", cancel: true, restock: true });
  refundable = await getOrder(refundable.id);
  assert.equal(refundable.payment.status, "refunded", "refunded in full");
  assert.equal(refundable.status, "cancelled");
  await settle();
  const refundEvents = received.filter((e) => e.type === "order.refunded" && e.data.id === refundable.id);
  assert.equal(refundEvents.length, 2, "order.refunded for each refund");
  assert.equal(refundEvents.at(-1).data.refundedTotal, 7000);
  assert.equal(received.filter((e) => e.type === "order.cancelled" && e.data.id === refundable.id).length, 1);

  /* ---------------------------------------------------- abandoned checkouts */

  const awaiting = (patch = {}) =>
    makeOrder({
      status: "awaiting_payment",
      cartId: `crt_${RUN}`,
      marketingConsent: true,
      payment: { provider: "stripe", status: "requires_payment", paymentIntentId: null, stripeAccountId: "acct_x", last4: null, failureMessage: null, paidAt: null, checkoutSessionId: `cs_${RUN}_${seq + 1}` },
      ...patch,
    });
  const expired = await awaiting();
  assert.ok(await abandonOrderPayment(expired, store, "expired"));
  assert.ok((await getOrder(expired.id)).abandoned?.at, "an expired Checkout session is an abandoned checkout");
  const replaced = await awaiting();
  await abandonOrderPayment(replaced, store, "expired", { superseded: true });
  assert.equal((await getOrder(replaced.id)).abandoned, undefined, "one the shopper replaced is not");
  const declined = await awaiting();
  await abandonOrderPayment(declined, store, "failed");
  assert.equal((await getOrder(declined.id)).abandoned, undefined, "nor is a declined payment");
  assert.deepEqual((await recovery.listAbandonedCheckouts(store.id)).map((o) => o.id), [expired.id]);

  // The setting.
  assert.equal((await refusal(orders.saveCheckoutRecovery(ctx(), { enabled: true, delayHours: "0" }))).field, "delayHours");
  const on = await orders.saveCheckoutRecovery(ctx(), { enabled: true, delayHours: "2" });
  assert.ok(on.enabledAt, "turning it on starts from now");
  store.checkoutRecovery = on;
  const kept = await orders.saveCheckoutRecovery(ctx(), { enabled: true, delayHours: "3" });
  assert.equal(kept.enabledAt, on.enabledAt, "changing the delay keeps when it was turned on");
  store.checkoutRecovery = kept;
  await db.updateOne(COLLECTIONS.stores, { id: store.id }, { $set: { checkoutRecovery: { ...kept, enabledAt: new Date(Date.now() - 48 * 3_600_000).toISOString() } } });
  store.checkoutRecovery = { ...kept, enabledAt: new Date(Date.now() - 48 * 3_600_000).toISOString() };

  const at = (hours) => ({ at: new Date(Date.now() - hours * 3_600_000).toISOString(), recoveryEmailAt: null, recoveredAt: null });
  const consenting = await makeOrder({ status: "cancelled", marketingConsent: true, abandoned: at(4), customer: { ...order.customer, email: `due-${RUN}@example.com` } });
  const noConsent = await makeOrder({ status: "cancelled", marketingConsent: false, abandoned: at(4), customer: { ...order.customer, email: `nc-${RUN}@example.com` } });
  const tooSoon = await makeOrder({ status: "cancelled", marketingConsent: true, abandoned: at(1), customer: { ...order.customer, email: `soon-${RUN}@example.com` } });
  const beforeOn = await makeOrder({ status: "cancelled", marketingConsent: true, abandoned: at(60), customer: { ...order.customer, email: `old-${RUN}@example.com` } });
  const optedOut = await makeOrder({ status: "cancelled", marketingConsent: true, abandoned: at(5), customer: { ...order.customer, email: `out-${RUN}@example.com` } });
  await db.insertOne(COLLECTIONS.customers, {
    id: `cus_${RUN}`,
    storeId: store.id,
    email: `out-${RUN}@example.com`,
    notes: [],
    marketing: { subscribed: false, updatedAt: new Date().toISOString() },
  });
  const [sentA, sentB] = await Promise.all([recovery.sendDueRecoveryEmails(), recovery.sendDueRecoveryEmails()]);
  assert.ok(sentA + sentB >= 1);
  await settle();
  const recoveryEmails = await audits({ action: "email.logged", "meta.kind": "checkout recovery" });
  assert.deepEqual(recoveryEmails.map((e) => e.meta.to), [`due-${RUN}@example.com`], "one email, to the consenting shopper whose delay has passed");
  assert.ok((await getOrder(consenting.id)).abandoned.recoveryEmailAt);
  for (const skipped of [noConsent, tooSoon, beforeOn]) assert.equal((await getOrder(skipped.id)).abandoned.recoveryEmailAt, null);
  const out = await getOrder(optedOut.id);
  assert.equal(out.marketingConsent, false, "a shopper who opted out since is not emailed");
  assert.equal(rules.recoveryState(out, store.checkoutRecovery, new Date()), "noConsent");
  assert.equal(await recovery.sendDueRecoveryEmails(), 0, "never twice");

  // The restore link.
  const token = await recovery.signRecoveryToken(store.id, consenting.id);
  assert.ok(await recovery.verifyRecoveryToken(store.id, consenting.id, token));
  assert.ok(!(await recovery.verifyRecoveryToken(store.id, expired.id, token)), "a link opens only its own checkout");
  const session = `shp_${RUN}`;
  assert.equal(await recovery.restoreCart(consenting, session), 1, "the line whose product is still on sale comes back");
  const cart = await db.findOne(COLLECTIONS.carts, { storeId: store.id, sessionId: session });
  assert.deepEqual(cart.items.map((i) => [i.storeProductId, i.variantId, i.quantity]), [[productId, "var_white", 3]]);
  assert.match(recovery.recoveryUrl("https://shop.example.com", consenting.id, token), /^https:\/\/shop\.example\.com\/cart\/restore\?o=ord_.+&t=.+$/);

  // Paying later marks the abandoned checkout recovered.
  const later = await awaiting({ customer: { ...order.customer, email: `ada-${RUN}@example.com` } });
  assert.ok(await confirmOrderPayment(later, store, { paymentIntentId: `pi_${RUN}_later`, last4: "4242", note: "Paid." }));
  const recovered = await getOrder(expired.id);
  assert.ok(recovered.abandoned.recoveredAt, "the same basket paid for later is recovered");
  assert.equal(recovered.abandoned.recoveredOrderId, later.id);
  assert.equal((await getOrder(noConsent.id)).abandoned.recoveredAt, null, "another shopper's checkout is untouched");
  await settle();
  assert.deepEqual(
    received.filter((e) => e.data?.id === later.id).map((e) => e.type).sort(),
    ["order.created", "order.paid"],
    "payment raises order.created and order.paid",
  );

  /* ------------------------------------------- an exception is not looped */

  // Re-running routing, recording the same purchase order and raising the same
  // exception, over and over, records the first round and nothing after it.
  const stuck = await makeOrder({
    status: "exception",
    fulfillment: { supplierId: null, supplierName: null, routing: "manual_required", supplierOrderRef: null, submittedAt: null, submissionMessage: "Held", carrier: null, trackingNumber: null, trackingUrl: null, exception: "Out of region" },
  });
  const loopOnce = async () => {
    await orders.routeToSupplier(ctx(), await getOrder(stuck.id));
    await orders.recordManualSubmission(ctx(), await getOrder(stuck.id), "QA-PO-REF");
    await orders.raiseException(ctx(), await getOrder(stuck.id), "Out of region again");
  };
  await loopOnce();
  const afterFirst = await getOrder(stuck.id);
  assert.deepEqual(afterFirst.events.slice(1).map((e) => e.status), ["Sent to supplier", "Exception raised"], "routing on an open exception records nothing");
  for (let i = 0; i < 3; i++) await loopOnce();
  const afterLoop = await getOrder(stuck.id);
  assert.equal(afterLoop.events.length, afterFirst.events.length, "an order already in exception is not resent or re-flagged");
  assert.equal(afterLoop.status, "exception");
  assert.equal((await audits({ entityId: stuck.code, action: "order.exception" })).length, 1, "the team is notified once");
  // A paid order routing reaches the same answer for twice is recorded once.
  const held = await makeOrder({ status: "paid", fulfillment: { ...stuck.fulfillment, exception: null } });
  await orders.routeToSupplier(ctx(), await getOrder(held.id));
  await orders.routeToSupplier(ctx(), await getOrder(held.id));
  assert.equal((await getOrder(held.id)).events.filter((e) => e.status === "Manual handling required").length, 1);

  assert.equal(stray, 0, "no request left the process");
  console.error = quiet.error;
  console.info = quiet.info;
  console.log(`order-ops-check ok: ${seq} orders worked, ${received.length} webhook deliveries, emails rendered in ${LOCALES.length} languages`);
} finally {
  console.error = quiet.error;
  console.info = quiet.info;
  await settleWebhookWork().catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 300));
  await db.deleteMany(COLLECTIONS.orders, { storeId: store.id });
  await db.deleteMany(COLLECTIONS.carts, { storeId: store.id });
  await db.deleteMany(COLLECTIONS.customers, { storeId: store.id });
  await db.deleteMany(COLLECTIONS.storeProducts, { storeId: store.id });
  await db.deleteMany(COLLECTIONS.webhookDeliveries, { storeId: store.id });
  await db.deleteMany(COLLECTIONS.webhookEndpoints, { storeId: store.id });
  await db.deleteMany(COLLECTIONS.notifications, { storeId: store.id });
  await db.deleteMany(COLLECTIONS.inventoryAdjustments, { storeId: store.id });
  await db.deleteMany(COLLECTIONS.stores, { id: store.id });
  await db.deleteMany(COLLECTIONS.audit, { storeId: store.id });
}
process.exit(0);

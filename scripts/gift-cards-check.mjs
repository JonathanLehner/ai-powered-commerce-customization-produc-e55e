// Self-check for gift cards: npm run gift-cards-check
//
// Runs the real gift card writes against throwaway records in the development
// database, and asserts that:
// - codes are random, readable and unique, and only the last four are shown;
// - a card pays the whole order when it can, and otherwise leaves at least the
//   minimum card charge, never more than its balance, and on Stripe Checkout
//   never more than the goods (a coupon cannot take delivery off);
// - two checkouts spending the last of a card at once cannot both have it:
//   of many holds racing for one balance exactly one lands;
// - an unpaid order gives its hold back once, a paid one takes it for good
//   once, however often the webhook arrives;
// - paying for the gift card product issues one card per unit, emailed to the
//   buyer, once, and an order of gift cards alone needs no supplier;
// - a card issued by hand comes back for a resubmitted form instead of twice.
//
// No request leaves the machine. It needs MONGODB_URI and MONGODB_DB from
// `.env.local`, and refuses to run against production.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PRODUCTION_DB } from "./mongo.mjs";

if (!process.env.MONGODB_DB || process.env.MONGODB_DB === PRODUCTION_DB) {
  console.error("gift-cards-check writes test data: set MONGODB_DB to the development database (see .env.local).");
  process.exit(1);
}
delete process.env.EMAIL_PROVIDER;
globalThis.fetch = async (url) => {
  throw new Error(`gift-cards-check makes no network calls (${url})`);
};

const rules = await import("../src/lib/gift-cards.ts");
const { db } = await import("../src/lib/mongo.ts");
const { COLLECTIONS } = await import("../src/lib/data.ts");
const cards = await import("../src/lib/gift-card-data.ts");
const { issueGiftCard, saveGiftCardProduct, updateGiftCard } = await import("../src/lib/operations/gift-cards.ts");
const { abandonOrderPayment, confirmOrderPayment } = await import("../src/lib/order-payment.ts");
const { matchesRoute } = await import("../src/lib/routes.ts");

// Outside a Next request the emails are logged rather than sent; that log is not what is checked.
const quiet = { error: console.error, info: console.info };
console.error = () => {};
console.info = () => {};

/* ------------------------------------------------------------------- codes */

const codes = new Set(Array.from({ length: 2000 }, () => rules.generateGiftCode()));
assert.equal(codes.size, 2000, "codes do not repeat");
for (const code of [...codes].slice(0, 50)) {
  assert.match(code, /^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/, "no 0, O, 1 or I to misread");
}
assert.equal(rules.normalizeGiftCode(" abcd efgh-jklm npqr "), "ABCD-EFGH-JKLM-NPQR", "typed however, stored one way");
assert.ok(rules.looksLikeGiftCode("abcdefghjklmnpqr") && !rules.looksLikeGiftCode("SUMMER10"));
assert.equal(rules.giftCodeLast4("ABCD-EFGH-JKLM-NPQR"), "NPQR");
assert.equal(rules.maskGiftCode("NPQR"), "•••• •••• •••• NPQR");

/* ------------------------------------------------------------ what it pays */

const card = (balance, currency = "EUR") => ({ balance, currency });
assert.deepEqual(rules.giftCardCover(card(5000), 4000, "EUR"), { amount: 4000, cardAmount: 4000, coversAll: true }, "it pays the whole order");
assert.deepEqual(rules.giftCardCover(card(2000), 5000, "EUR"), { amount: 2000, cardAmount: 2000, coversAll: false }, "or all it holds");
assert.equal(rules.giftCardCover(card(4950), 5000, "EUR").amount, 5000 - rules.MINIMUM_CARD_CHARGE, "leaving at least the minimum card charge");
assert.equal(rules.giftCardCover(card(5000), 4000, "EUR", { canCoverAll: false }).coversAll, false, "Stripe Tax: the card cannot settle the order up front");
assert.equal(rules.giftCardCover(card(0), 4000, "EUR").amount, 0);
const stripe = rules.basketGiftCardCover(card(10000), { total: 3000, shipping: 500, stripeTax: true }, "EUR", "stripe");
assert.equal(stripe.amount, 2500, "on Checkout only the goods can be paid by card coupon, not delivery");
const crossCurrency = rules.giftCardCover(card(1000, "EUR"), 50000, "USD");
assert.ok(crossCurrency.cardAmount <= 1000, "a card spent in another currency never gives more than it holds");
assert.ok(crossCurrency.amount > 1000, "and converts at the store's rates");
assert.deepEqual(rules.cleanDenominations([5000, 2500, 2500, 50, 2_000_000, 10000, 1.5]), [2500, 5000, 10000]);
const now = new Date("2026-06-01T00:00:00Z");
assert.equal(rules.giftCardRefusal(null), "unknown");
assert.equal(rules.giftCardRefusal({ status: "disabled", balance: 100, expiresAt: null }, now), "disabled");
assert.equal(rules.giftCardRefusal({ status: "active", balance: 100, expiresAt: "2026-05-31T23:59:59Z" }, now), "expired");
assert.equal(rules.giftCardRefusal({ status: "active", balance: 0, expiresAt: null }, now), "empty");
assert.equal(rules.giftCardRefusal({ status: "active", balance: 1, expiresAt: null }, now), null);

/* --------------------------------------------------------- against the db */

const RUN = `gft${Date.now().toString(36)}`;
const template = await db.findOne(COLLECTIONS.stores, { id: "str_rivet" });
const orderTemplate = await db.findOne(COLLECTIONS.orders, { storeId: "str_rivet", "campaign.campaignId": { $exists: false } });
const productTemplate = await db.findOne(COLLECTIONS.storeProducts, { storeId: "str_rivet" });
assert.ok(template && orderTemplate && productTemplate, "the seeded rivet-hardware store is in the development database (npm run seed)");
const store = { ...template, id: `str_${RUN}`, slug: `gift-cards-check-${RUN}`, customDomain: null, demo: true, defaultCurrency: "EUR", currencies: ["EUR", "USD"] };
delete store._id;
await db.insertOne(COLLECTIONS.stores, store);
const ctx = { store, actor: { id: "usr_gift_check", name: "Gift Check" }, locale: "en" };

let orders = 0;
async function makeOrder(items, extra = {}) {
  orders += 1;
  const order = {
    ...orderTemplate,
    id: `ord_${RUN}_${orders}`,
    storeId: store.id,
    code: `GFT-${RUN.toUpperCase()}-${orders}`,
    status: "awaiting_payment",
    currency: "EUR",
    locale: "en",
    customer: { ...orderTemplate.customer, email: `buyer-${RUN}@example.com`, name: "Gift Buyer" },
    items,
    discount: null,
    giftCard: null,
    inventory: null,
    refunds: [],
    events: [],
    payment: { provider: "stripe", status: "requires_payment", paymentIntentId: null, stripeAccountId: null, last4: null, failureMessage: null, paidAt: null },
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
const reloadCard = (id) => db.findOne(COLLECTIONS.giftCards, { id });

try {
  /* ---- one balance, many checkouts */
  const issued = await cards.createGiftCard({
    storeId: store.id,
    currency: "EUR",
    initialValue: 5000,
    source: "manual",
    orderId: null,
    orderCode: null,
    orderItemKey: null,
    recipientEmail: "",
    recipientName: "",
    note: "",
    expiresAt: null,
    createdBy: "Gift Check",
  });
  assert.equal(issued.balance, 5000);
  assert.equal((await cards.getGiftCardByCode(store.id, issued.code.toLowerCase().replace(/-/g, " "))).id, issued.id, "found by the code however it is typed");

  const racing = await Promise.all(Array.from({ length: 10 }, (_, i) => cards.holdGiftCard(store.id, issued.id, `ord_race_${i}`, 3000)));
  assert.equal(racing.filter(Boolean).length, 1, "only one of ten checkouts gets the last 30.00");
  assert.equal((await reloadCard(issued.id)).balance, 2000);
  const winner = `ord_race_${racing.indexOf(true)}`;
  assert.equal(await cards.holdGiftCard(store.id, issued.id, winner, 1000), false, "an order holds once");

  /* ---- unpaid gives back once, paid takes once */
  const held = { id: winner, storeId: store.id, code: "RACE", giftCard: { cardId: issued.id, last4: issued.last4, amount: 3000, cardAmount: 3000 } };
  assert.equal(await cards.releaseGiftCardHold(held), true);
  assert.equal(await cards.releaseGiftCardHold(held), false, "a second release changes nothing");
  assert.equal((await reloadCard(issued.id)).balance, 5000);
  assert.equal(await cards.holdGiftCard(store.id, issued.id, winner, 3000), true);
  assert.equal(await cards.commitGiftCardHold(held), true);
  assert.equal(await cards.commitGiftCardHold(held), false, "a webhook delivered twice spends it once");
  assert.equal(await cards.releaseGiftCardHold(held), false, "a spent hold cannot be given back");
  const spent = await reloadCard(issued.id);
  assert.equal(spent.balance, 2000);
  assert.deepEqual(spent.holds, []);
  assert.deepEqual(spent.transactions.map((t) => [t.kind, t.amount]), [["issued", 5000], ["released", 3000], ["redeemed", -3000]]);

  /* ---- the order paths */
  const paidOrder = await makeOrder(
    [{ ...orderTemplate.items[0], storeProductId: productTemplate.id, variantId: productTemplate.variants[0].id, quantity: 1, unitPrice: 2500 }],
    { total: 2500, subtotal: 2500, giftCard: { cardId: issued.id, last4: issued.last4, amount: 1500, cardAmount: 1500 } },
  );
  assert.equal(await cards.holdGiftCard(store.id, issued.id, paidOrder.id, 1500), true);
  const unpaid = await makeOrder([], { total: 300, giftCard: { cardId: issued.id, last4: issued.last4, amount: 300, cardAmount: 300 } });
  assert.equal(await cards.holdGiftCard(store.id, issued.id, unpaid.id, 300), true);
  assert.equal((await reloadCard(issued.id)).balance, 200);
  assert.equal(await abandonOrderPayment(unpaid, store, "expired"), true);
  assert.equal(await abandonOrderPayment(unpaid, store, "expired"), false);
  assert.equal((await reloadCard(issued.id)).balance, 500, "an expired checkout gives the card its 3.00 back, once");

  /* ---- selling gift cards */
  const product = await saveGiftCardProduct(ctx, { name: "Gift card", description: "Any time.", denominations: [5000, 2500], published: true });
  assert.equal(product.giftCard, true);
  assert.deepEqual(product.variants.map((v) => v.price), [2500, 5000], "one variant per amount, lowest first");
  assert.equal(product.status, "published");
  assert.equal(product.taxBracketId, null, "a gift card is not taxed when it is sold");
  const again = await saveGiftCardProduct(ctx, { name: "Gift card", description: "Any time.", denominations: [2500, 5000, 10000], published: true });
  assert.equal(again.id, product.id, "saving again updates the one product");
  assert.equal(again.variants.find((v) => v.price === 2500).id, product.variants.find((v) => v.price === 2500).id, "an amount keeps its variant");
  await assert.rejects(saveGiftCardProduct(ctx, { name: "Gift card", description: "", denominations: [1], published: true }), /at least one amount/i);

  const giftOnly = await makeOrder([
    { ...orderTemplate.items[0], id: "oit_gc_1", storeProductId: product.id, variantId: product.variants[1].id, productName: "Gift card", variantName: "€50.00", quantity: 2, unitPrice: 5000, supplierId: "" },
  ], { total: 10000, subtotal: 10000 });
  assert.equal(await confirmOrderPayment(giftOnly, store, { paymentIntentId: null, last4: "4242", note: "Demo." }), true);
  assert.equal(await confirmOrderPayment(giftOnly, store, { paymentIntentId: null, last4: "4242", note: "Demo." }), false);
  const settled = await db.findOne(COLLECTIONS.orders, { id: giftOnly.id });
  assert.equal(settled.status, "delivered", "gift cards alone need no supplier: the order is done");
  assert.equal(settled.fulfillment.exception, null);
  const bought = await db.find(COLLECTIONS.giftCards, { storeId: store.id, orderId: giftOnly.id });
  assert.equal(bought.length, 2, "one card per unit");
  assert.ok(bought.every((c) => c.initialValue === 5000 && c.balance === 5000 && c.recipientEmail === giftOnly.customer.email && c.source === "purchase"));
  assert.equal(new Set(bought.map((c) => c.code)).size, 2);
  const again2 = await cards.issueOrderGiftCards(settled, store);
  assert.equal(again2.issued.length, 0, "issuing again for the same order makes nothing new");
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const mails = await db.find(COLLECTIONS.audit, { storeId: store.id, "meta.kind": "gift card" });
  assert.equal(mails.length, 2, "each code is emailed to the buyer");
  assert.ok(mails.every((m) => m.meta.to === giftOnly.customer.email));

  assert.equal(await confirmOrderPayment(paidOrder, store, { paymentIntentId: null, last4: "4242", note: "Demo." }), true);
  const afterPaid = await reloadCard(issued.id);
  assert.equal(afterPaid.balance, 500, "a paid order keeps what it held");
  assert.ok(afterPaid.transactions.some((t) => t.kind === "redeemed" && t.amount === -1500 && t.orderCode === paidOrder.code));

  /* ---- issued by hand */
  const manual = { amount: 2000, currency: "EUR", recipientEmail: `friend-${RUN}@example.com`, recipientName: "Friend", note: "Thanks!", expiresOn: null, send: true, submissionKey: `key_${RUN}` };
  const first = await issueGiftCard(ctx, manual);
  const second = await issueGiftCard(ctx, manual);
  assert.equal(first.id, second.id, "a resubmitted form gets back the card it made");
  await assert.rejects(issueGiftCard(ctx, { ...manual, submissionKey: null, amount: 10 }), /between/i);
  await assert.rejects(issueGiftCard(ctx, { ...manual, submissionKey: null, currency: "JPY" }), /currenc/i);
  await assert.rejects(issueGiftCard(ctx, { ...manual, submissionKey: null, recipientEmail: "" }), /email/i, "sending needs an address");
  const disabled = await updateGiftCard(ctx, first, { status: "disabled" });
  assert.equal(disabled.status, "disabled");
  assert.equal(await cards.holdGiftCard(store.id, first.id, "ord_after_disable", 100), false, "a disabled card cannot be spent");

  /* ---- wiring */
  for (const path of ["/app/stores/str_1/gift-cards", "/api/v1/stores/str_1/gift-cards", "/api/v1/stores/str_1/gift-cards/gft_1", "/api/v1/stores/str_1/gift-cards/product"]) {
    assert.ok(matchesRoute(path), `${path} is a page`);
  }
  const operations = readFileSync(new URL("../src/lib/api/operations.ts", import.meta.url), "utf8");
  for (const id of ["listGiftCards", "getGiftCard", "issueGiftCard", "updateGiftCard", "getGiftCardProduct", "updateGiftCardProduct"]) {
    assert.ok(operations.includes(`id: "${id}"`), `the Admin API and MCP offer ${id}`);
  }
  const present = readFileSync(new URL("../src/lib/api/present.ts", import.meta.url), "utf8");
  assert.match(present, /code: _code/, "the API never lists a card's full code");
  const shop = readFileSync(new URL("../src/lib/operations/shop.ts", import.meta.url), "utf8");
  assert.match(shop, /holdGiftCard\(storeId, card\.id, orderId, cover\.cardAmount\)/, "checkout holds the card before payment");
} finally {
  await Promise.all([
    db.deleteMany(COLLECTIONS.stores, { id: store.id }),
    db.deleteMany(COLLECTIONS.storeProducts, { storeId: store.id }),
    db.deleteMany(COLLECTIONS.orders, { storeId: store.id }),
    db.deleteMany(COLLECTIONS.giftCards, { storeId: store.id }),
    db.deleteMany(COLLECTIONS.audit, { storeId: store.id }),
    db.deleteMany(COLLECTIONS.notifications, { storeId: store.id }),
    db.deleteMany(COLLECTIONS.customers, { storeId: store.id }),
  ]);
  console.error = quiet.error;
  console.info = quiet.info;
}

console.log("gift-cards-check ok: one balance spent once, holds settle once, purchases issue one card per unit");
process.exit(0);

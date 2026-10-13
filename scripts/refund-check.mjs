// Self-check for simulated refunds: npm run refund-check
//
// Demo-store orders and orders taken before Stripe Checkout were paid through
// the simulated gateway, and are refunded through it. (Orders paid on Stripe
// Checkout go through the Refunds API; see `npm run stripe-check`.)
//
// The bug this guards against is a refund that only writes a row: the order
// showed the money back while the shopper's card never saw it. Every refusal
// here must come back with no refund id, so the action records nothing.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { refundSimulated as refundCharge } from "../src/lib/demo-payment.ts";
import { lineRefundAmount, refundTotal, restockPlan, restockableUnits } from "../src/lib/refunds.ts";

const store = {
  id: "sto_1",
  defaultLanguage: "en",
  currencies: ["GBP", "EUR"],
  stripe: { connected: true, chargesEnabled: true, accountId: "acct_1Northwind" },
};

const base = { store, paymentIntentId: "pi_3abc123xyz", amount: 2500, currency: "GBP", idempotencyKey: "ord_1:0:2500" };

/* ------------------------------------------------------ the money goes back */

const ok = await refundCharge(base);
assert.equal(ok.ok, true);
assert.match(ok.refundId, /^re_3/, "a gateway refund id comes back for the refund row");
assert.ok(ok.message.includes("pi_3abc123xyz"), "against the intent the charge was captured on");
assert.ok(ok.message.startsWith("Demo refund"), "the timeline says no money moved");

// Same order, same amount, same already-refunded total: the same refund, not a
// second one. That is what makes a double click safe.
assert.equal((await refundCharge(base)).refundId, ok.refundId);
assert.notEqual(
  (await refundCharge({ ...base, idempotencyKey: "ord_1:2500:2500" })).refundId,
  ok.refundId,
  "a genuine second refund on the same order is its own refund",
);

/* ----------------------------------------------- refusals return no refund id */

for (const [label, input] of [
  ["an order that never captured a payment", { paymentIntentId: null }],
  ["a currency the store does not sell in", { currency: "USD" }],
  ["a zero refund", { amount: 0 }],
  ["a negative refund", { amount: -500 }],
  ["fractional minor units", { amount: 12.5 }],
  ["an account that cannot charge yet", { store: { ...store, stripe: { ...store.stripe, chargesEnabled: false } } }],
  ["an account that was never connected", { store: { ...store, stripe: { ...store.stripe, connected: false } } }],
]) {
  const result = await refundCharge({ ...base, ...input });
  assert.equal(result.ok, false, label);
  assert.equal(result.refundId, null, `${label}: nothing to record`);
  assert.ok(result.message.length > 10, `${label}: the team is told why`);
  assert.ok(result.code, `${label}: refusals carry a code`);
}

/* --------------------------------------- which gateway an order is refunded on */

// The workspace action and the Admin API both refund through this operation.
const action = readFileSync(new URL("../src/lib/operations/orders.ts", import.meta.url), "utf8");
assert.match(action, /if \(!checkoutSessionId\) \{\n\s+return refundSimulated\(/, "only orders without a Checkout session are simulated");
assert.match(action, /refundOnConnectedAccount\(\{ accountId: stripeAccountId, paymentIntentId, amount, idempotencyKey \}\)/, "Checkout orders are refunded on the account they were charged on");

/* ------------------------------------------------- itemised refunds add up */

// Two tees at 20.00 and a mug at 10.00, 10% off, 5.00 shipping: 50.00 subtotal,
// 45.00 of goods charged, 50.00 in all.
const tee = { id: "itm_tee", storeProductId: "sp_tee", variantId: "v_m", productName: "Tee", quantity: 2, unitPrice: 2000 };
const mug = { id: "itm_mug", storeProductId: "sp_mug", variantId: "v_1", productName: "Mug", quantity: 1, unitPrice: 1000 };
const order = {
  items: [tee, mug],
  subtotal: 5000,
  shipping: 500,
  total: 5000,
  refunds: [],
  inventory: { state: "committed", lines: [{ productId: "sp_tee", variantId: "v_m", quantity: 2 }] },
};
const pick = (lines) => lines.map(([itemId, quantity]) => ({ itemId, quantity, restock: true }));

assert.equal(refundTotal(order, [], 0), 0, "nothing chosen refunds nothing");
assert.equal(lineRefundAmount(order, tee, 1), 1800, "a line refunds what was charged for it, after the discount");
assert.equal(refundTotal(order, pick([["itm_tee", 1]]), 0), 1800);
assert.equal(refundTotal(order, pick([["itm_tee", 1]]), 500), 2300, "shipping is added on top");
assert.equal(refundTotal(order, pick([["itm_tee", 2], ["itm_mug", 1]]), 500), 5000, "everything refunds the whole total");

// A first refund of one tee leaves one tee and one restockable unit.
const after = {
  ...order,
  refunds: [{ amount: 1800, lines: [{ itemId: "itm_tee", quantity: 1, restocked: 1 }] }],
};
assert.equal(refundTotal(after, pick([["itm_tee", 1], ["itm_mug", 1]]), 500), 3200, "the rest is what is left");
assert.equal(restockableUnits(after).get("sp_tee:v_m"), 1);
assert.deepEqual(
  restockPlan(after, [{ itemId: "itm_tee", quantity: 1 }, { itemId: "itm_mug", quantity: 1 }]).map((p) => [p.itemId, p.quantity]),
  [["itm_tee", 1]],
  "only tracked units not already back on hand are restocked",
);
assert.equal(restockableUnits({ ...after, inventory: { ...order.inventory, restockedAt: "2026-01-01" } }).size, 0, "an order restocked in one go has nothing left to restock");

console.log("refund-check ok");

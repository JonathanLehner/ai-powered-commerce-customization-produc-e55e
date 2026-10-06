// Self-check for gateway refunds: npm run refund-check
//
// The bug this guards against is a refund that only writes a row: the order
// showed the money back while the shopper's card never saw it. Every refusal
// here must come back with no refund id, so the action records nothing.
import assert from "node:assert/strict";
import { refundCharge } from "../src/lib/stripe.ts";

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
assert.ok(ok.message.includes("acct_1Northwind"), "settled on the store's own connected account");
assert.ok(ok.message.includes("pi_3abc123xyz"), "against the intent the charge was captured on");

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

console.log("refund-check ok");

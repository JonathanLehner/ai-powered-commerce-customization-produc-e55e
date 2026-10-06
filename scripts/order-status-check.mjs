// Self-check for the hand-made order status moves: npm run order-status-check
import assert from "node:assert/strict";
import { canMoveOrder } from "../src/lib/types.ts";

const order = (status, payment = "succeeded") => ({ status, payment: { status: payment } });

// The normal path, one step at a time.
assert.equal(canMoveOrder(order("paid"), "in_production"), true);
assert.equal(canMoveOrder(order("in_production"), "shipped"), true);
assert.equal(canMoveOrder(order("shipped"), "delivered"), true);

// No skipping ahead or going back, and an unpaid order cannot ship.
assert.equal(canMoveOrder(order("awaiting_payment", "requires_payment"), "delivered"), false);
assert.equal(canMoveOrder(order("delivered"), "in_production"), false);
assert.equal(canMoveOrder(order("cancelled", "refunded"), "paid"), false);

// Cancelling a captured payment has to go through the refund form.
assert.equal(canMoveOrder(order("paid"), "cancelled"), false);
assert.equal(canMoveOrder(order("awaiting_payment", "requires_payment"), "cancelled"), true);
assert.equal(canMoveOrder(order("in_production", "refunded"), "cancelled"), true);

// An exception can be put back anywhere on the path.
assert.equal(canMoveOrder(order("exception"), "shipped"), true);

console.log("order-status-check ok");

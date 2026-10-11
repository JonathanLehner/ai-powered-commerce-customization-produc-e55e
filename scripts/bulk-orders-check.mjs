// Self-check for the bulk actions on the Orders page: npm run bulk-orders-check
//
// The toolbar says which ticked rows an action will skip, and the server action
// refuses the same rows, so both read these rules. A row the toolbar offers but
// the server refuses (or the reverse) would report a failure nobody expected.
import assert from "node:assert/strict";
import {
  BULK_ORDER_LIMIT,
  moveBlock,
  parseOrderIds,
  pickOrders,
  routeBlock,
  shipBlock,
} from "../src/lib/bulk-orders.ts";

const order = (status, payment = "succeeded") => ({ status, payment: { status: payment } });

// Mark as shipped: production under way, or a shipped order getting new tracking.
assert.equal(shipBlock(order("in_production")), null);
assert.equal(shipBlock(order("exception")), null);
assert.equal(shipBlock(order("shipped")), null, "a shipped order can be re-tracked");
for (const status of ["awaiting_payment", "paid", "delivered", "cancelled"]) {
  assert.equal(shipBlock(order(status)), "notInProduction", status);
}

// Advance status follows the same rules as the order page's buttons.
assert.equal(moveBlock(order("paid"), "in_production"), null);
assert.equal(moveBlock(order("in_production"), "shipped"), null);
assert.equal(moveBlock(order("shipped"), "delivered"), null);
assert.equal(moveBlock(order("shipped"), "shipped"), "alreadyStatus");
assert.equal(moveBlock(order("paid"), "delivered"), "cannotMove", "no skipping production");
assert.equal(moveBlock(order("delivered"), "in_production"), "cannotMove");
assert.equal(moveBlock(order("cancelled"), "shipped"), "cannotMove");

// Only paid orders are sent to a supplier; anything further along is not re-sent.
assert.equal(routeBlock(order("paid")), null);
for (const status of ["awaiting_payment", "in_production", "shipped", "delivered", "cancelled", "exception"]) {
  assert.equal(routeBlock(order(status)), "notPaid", status);
}

// Ids from the URL or the action: trimmed, de-duplicated, capped.
assert.deepEqual(parseOrderIds(" ord_1, ord_2,,ord_1 "), ["ord_1", "ord_2"]);
assert.deepEqual(parseOrderIds(["ord_3", 4, "", "ord_3"]), ["ord_3"]);
assert.deepEqual(parseOrderIds(undefined), []);
assert.deepEqual(parseOrderIds({ id: "ord_1" }), []);
assert.equal(parseOrderIds(Array.from({ length: 500 }, (_, i) => `ord_${i}`)).length, BULK_ORDER_LIMIT);

// The download keeps the queue's order, whatever order the boxes were ticked in.
const queue = [{ id: "a" }, { id: "b" }, { id: "c" }];
assert.deepEqual(pickOrders(queue, ["c", "a", "zzz"]).map((o) => o.id), ["a", "c"]);

console.log("bulk-orders-check ok");

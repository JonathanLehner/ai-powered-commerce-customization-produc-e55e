// Self-check for discount codes: npm run discount-check
//
// A discount is money, so the rules that decide one have to hold without a
// browser: what a code is worth, when it stops working, how it is spread across
// the basket lines so tax follows the discounted price, and that the shopper's
// own input can never become a price.
import assert from "node:assert/strict";
import {
  MAX_DISCOUNT_PERCENTAGE,
  allocateDiscount,
  checkDiscount,
  clampPercentage,
  discountAmount,
  isExpired,
  normalizeDiscountCode,
} from "../src/lib/discounts.ts";
import { taxRowsFor } from "../src/lib/pricing.ts";

const code = (overrides = {}) => ({
  id: "dsc_1",
  storeId: "str_northwind",
  code: "SPRING10",
  kind: "percentage",
  value: 10,
  currency: "GBP",
  minimumSubtotal: 0,
  expiresAt: null,
  usageLimit: null,
  timesUsed: 0,
  active: true,
  createdBy: "Alex Moreau",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

/* ----------------------------------------------- one code, however it is typed */

assert.equal(normalizeDiscountCode("spring10"), "SPRING10");
assert.equal(normalizeDiscountCode(" spring-10 "), "SPRING10");
assert.equal(normalizeDiscountCode("spring 10!"), "SPRING10");
assert.equal(normalizeDiscountCode(""), "");
assert.equal(normalizeDiscountCode("é"), "", "nothing but punctuation is not a code");
assert.equal(normalizeDiscountCode("A".repeat(60)).length, 24, "a code is capped, not unbounded");

/* --------------------------------------------------------------- what it is worth */

assert.equal(discountAmount(code(), 10000, "GBP"), 1000);
// Rounded to the minor unit, never a fraction of a penny.
assert.equal(discountAmount(code({ value: 15 }), 3333, "GBP"), 500);
// A fixed amount is stated in the store's currency and converted like any price.
assert.equal(discountAmount(code({ kind: "fixed", value: 1000 }), 10000, "GBP"), 1000);
assert.notEqual(discountAmount(code({ kind: "fixed", value: 1000 }), 100000, "EUR"), 1000);
// It can never exceed the goods it comes off, so a total cannot go negative.
assert.equal(discountAmount(code({ kind: "fixed", value: 5000 }), 1200, "GBP"), 1200);

assert.equal(clampPercentage(0), 1);
assert.equal(clampPercentage(999), MAX_DISCOUNT_PERCENTAGE);
assert.equal(clampPercentage(10.4), 10);

/* ------------------------------------------------------------ when it is refused */

assert.equal(checkDiscount(code(), 10000, "GBP").refusal, null);
assert.equal(checkDiscount(code({ active: false }), 10000, "GBP").refusal, "inactive");
assert.equal(
  checkDiscount(code({ usageLimit: 2, timesUsed: 2 }), 10000, "GBP").refusal,
  "limitReached",
);
assert.equal(checkDiscount(code({ usageLimit: 2, timesUsed: 1 }), 10000, "GBP").refusal, null);

// Expiry is the end of the stored day: a code dated today still works today.
const expiring = code({ expiresAt: "2026-03-09" });
assert.equal(isExpired(expiring, new Date("2026-03-09T23:00:00.000Z")), false);
assert.equal(isExpired(expiring, new Date("2026-03-10T00:30:00.000Z")), true);
assert.equal(isExpired(code(), new Date("2099-01-01T00:00:00.000Z")), false, "no expiry never expires");
assert.equal(checkDiscount(expiring, 10000, "GBP", new Date("2026-03-11T00:00:00.000Z")).refusal, "expired");

// The minimum is the store's own amount, converted into what the shopper is
// buying in, and it is reported so the storefront can name it.
const minimum = code({ minimumSubtotal: 5000 });
assert.equal(checkDiscount(minimum, 4999, "GBP").refusal, "belowMinimum");
assert.equal(checkDiscount(minimum, 4999, "GBP").amount, 0, "a refused code is worth nothing");
assert.equal(checkDiscount(minimum, 5000, "GBP").refusal, null);
assert.equal(checkDiscount(minimum, 5000, "GBP").minimum, 5000);
assert.notEqual(checkDiscount(minimum, 5000, "EUR").minimum, 5000, "the minimum follows the currency");

// A fixed amount that rounds away against a tiny basket is not an applied discount.
assert.equal(checkDiscount(code({ kind: "fixed", value: 0 }), 10000, "GBP").refusal, "belowMinimum");

/* ------------------------------------- spread across the lines, to the last penny */

for (const [amounts, discount] of [
  [[1000, 2000, 3000], 600],
  [[333, 333, 334], 100],
  [[999], 333],
  [[1, 1, 1, 1, 1, 1, 1], 3],
]) {
  const shares = allocateDiscount(amounts, discount);
  assert.equal(
    shares.reduce((sum, share) => sum + share, 0),
    discount,
    `${JSON.stringify(amounts)} loses or invents a penny`,
  );
  assert.ok(
    shares.every((share, index) => share >= 0 && share <= amounts[index]),
    "no line may be discounted past its own value",
  );
}
assert.deepEqual(allocateDiscount([1000, 1000], 0), [0, 0]);
assert.deepEqual(allocateDiscount([0, 0], 500), [0, 0], "nothing to discount, nothing allocated");

/* ------------------------------- tax is charged on what the shopper actually pays */

// Two brackets, 20% and 5%, and a 10% code. Each rate has to come off with the
// goods it covers — charging tax on the list price is money the shopper never
// agreed to pay.
const amounts = [10000, 5000];
const rates = [20, 5];
const shares = allocateDiscount(amounts, 1500);
const full = taxRowsFor(amounts.map((amount, i) => ({ amount, rate: rates[i] })), 0, false);
const discounted = taxRowsFor(
  amounts.map((amount, i) => ({ amount: amount - shares[i], rate: rates[i] })),
  0,
  false,
);
assert.deepEqual(full, [{ rate: 20, amount: 2000 }, { rate: 5, amount: 250 }]);
assert.deepEqual(discounted, [{ rate: 20, amount: 1800 }, { rate: 5, amount: 225 }]);

console.log("discount-check ok");

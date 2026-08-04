// Self-check for the per-line tax maths: npm run tax-check
import assert from "node:assert/strict";
import { taxRowsFor } from "../src/lib/pricing.ts";

const sum = (rows) => rows.reduce((s, r) => s + r.amount, 0);

// A basket mixing brackets is taxed line by line, not at a single fallback rate.
const mixed = taxRowsFor([{ amount: 2100, rate: 20 }, { amount: 1500, rate: 0 }], 0, false);
assert.deepEqual(mixed, [{ rate: 20, amount: 420 }, { rate: 0, amount: 0 }]);

// One row per rate, highest first, lines on the same rate merged.
const merged = taxRowsFor(
  [{ amount: 1000, rate: 7 }, { amount: 1000, rate: 20 }, { amount: 1000, rate: 7 }],
  0,
  false,
);
assert.deepEqual(merged, [{ rate: 20, amount: 200 }, { rate: 7, amount: 140 }]);

// Shipping is split across the rates in proportion to line value, with no
// rounding drift: an odd charge still allocates in full.
const shipped = taxRowsFor([{ amount: 1000, rate: 20 }, { amount: 1000, rate: 10 }], 501, false);
assert.equal(shipped[0].amount + shipped[1].amount, sum(shipped));
assert.deepEqual(shipped, [{ rate: 20, amount: 250 }, { rate: 10, amount: 125 }]);

// Tax-inclusive stores back the tax out of the price, per rate.
const inclusive = taxRowsFor([{ amount: 1200, rate: 20 }, { amount: 1000, rate: 0 }], 590, true);
assert.deepEqual(inclusive, [{ rate: 20, amount: 200 }, { rate: 0, amount: 0 }]);

// Empty basket, no rows.
assert.deepEqual(taxRowsFor([], 0, false), []);

console.log("tax-check ok");

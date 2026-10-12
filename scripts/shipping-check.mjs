// Self-check for shipping zones, rates and checkout tax: npm run shipping-check
import assert from "node:assert/strict";
import {
  basketWeight,
  checkRate,
  checkTaxRates,
  checkZone,
  orderTax,
  pickOption,
  quoteTotals,
  rateAmount,
  shippingOptions,
  stripeAllowedCountries,
  zoneFor,
} from "../src/lib/shipping.ts";

const rate = (fields) => ({ id: fields.id ?? fields.kind, name: "Rate", amount: 0, tiers: [], threshold: null, minDays: 2, maxDays: 5, ...fields });
const zone = (id, countries, rates, currency = "EUR") => ({ id, storeId: "st", name: id, countries, currency, rates, createdAt: "", updatedAt: "" });

const europe = zone("europe", ["DE", "FR", "NL"], [
  rate({ id: "flat", kind: "flat", amount: 990 }),
  rate({ id: "free", kind: "free_over", amount: 590, threshold: 5000 }),
]);
const world = zone("world", ["US", "JP", "CU"], [
  rate({ id: "weight", kind: "weight", tiers: [{ upTo: 500, amount: 1500 }, { upTo: 2000, amount: 2500 }] }),
  rate({ id: "subtotal", kind: "subtotal", tiers: [{ upTo: 10000, amount: 2000 }, { upTo: null, amount: 0 }] }),
]);
const zones = [europe, world];

// Zone matching: by country code, case-insensitively, and nowhere else.
assert.equal(zoneFor(zones, "fr"), europe);
assert.equal(zoneFor(zones, "JP"), world);
assert.equal(zoneFor(zones, "BR"), null);
assert.deepEqual(shippingOptions(zones, "BR", { weightGrams: 0, subtotal: 1000, currency: "EUR" }), []);
// Checkout only collects addresses in zone countries Stripe supports.
assert.deepEqual(stripeAllowedCountries(zones), ["DE", "FR", "JP", "NL", "US"]);

// Weight rates: the first tier whose bound holds the weight, bounds inclusive;
// past the last bounded tier the rate is not offered.
const byWeight = world.rates[0];
assert.equal(rateAmount(byWeight, { weightGrams: 0, subtotal: 0 }), 1500);
assert.equal(rateAmount(byWeight, { weightGrams: 500, subtotal: 0 }), 1500);
assert.equal(rateAmount(byWeight, { weightGrams: 501, subtotal: 0 }), 2500);
assert.equal(rateAmount(byWeight, { weightGrams: 2001, subtotal: 0 }), null);

// Subtotal rates, with an open last tier.
const bySubtotal = world.rates[1];
assert.equal(rateAmount(bySubtotal, { weightGrams: 0, subtotal: 10000 }), 2000);
assert.equal(rateAmount(bySubtotal, { weightGrams: 0, subtotal: 10001 }), 0);

// Free over a threshold: charged below it, free at and above it.
const freeOver = europe.rates[1];
assert.equal(rateAmount(freeOver, { weightGrams: 0, subtotal: 4999 }), 590);
assert.equal(rateAmount(freeOver, { weightGrams: 0, subtotal: 5000 }), 0);

// Options come cheapest first; the threshold is checked after discounts.
const below = shippingOptions(zones, "DE", { weightGrams: 0, subtotal: 4000, currency: "EUR" });
assert.deepEqual(below.map((o) => [o.rateId, o.amount]), [["free", 590], ["flat", 990]]);
const above = shippingOptions(zones, "DE", { weightGrams: 0, subtotal: 6000, currency: "EUR" });
assert.deepEqual(above.map((o) => [o.rateId, o.amount]), [["free", 0], ["flat", 990]]);
// A heavy parcel drops the weight rate and keeps the subtotal one.
const heavy = shippingOptions(zones, "US", { weightGrams: 3000, subtotal: 5000, currency: "EUR" });
assert.deepEqual(heavy.map((o) => o.rateId), ["subtotal"]);

// The shopper's pick when on offer, the cheapest otherwise.
assert.equal(pickOption(below, "flat").rateId, "flat");
assert.equal(pickOption(below, "weight").rateId, "free");
assert.equal(pickOption([], "flat"), null);

// Order weight from each variant's weight; a variant without one weighs nothing.
const product = { variants: [{ id: "v1", weightGrams: 250 }, { id: "v2" }] };
assert.equal(
  basketWeight([
    { quantity: 3, variantId: "v1", product },
    { quantity: 2, variantId: "v2", product },
    { quantity: 1, variantId: "v1", product: null },
  ]),
  750,
);

// Tax. Exclusive prices add it on top, shipping included in the base.
const basis = (inclusive, extra = {}) => ({
  lines: [{ amount: 10000, rate: 20 }],
  goods: 10000,
  inclusive,
  stripeTax: false,
  countryRates: [],
  ...extra,
});
const exclusive = quoteTotals(basis(false), "DE", 1000);
assert.deepEqual(exclusive.taxRows, [{ rate: 20, amount: 2200 }]);
assert.equal(exclusive.total, 10000 + 1000 + 2200);

// Inclusive prices already hold the tax: reported, not added.
const inclusive = quoteTotals(basis(true), "DE", 1000);
assert.deepEqual(inclusive.taxRows, [{ rate: 20, amount: 1667 }]);
assert.equal(inclusive.total, 11000);

// A store rate for the destination replaces the product brackets there only.
const withCountry = basis(false, { countryRates: [{ country: "FR", rate: 5.5 }] });
assert.deepEqual(quoteTotals(withCountry, "FR", 0).taxRows, [{ rate: 5.5, amount: 550 }]);
assert.deepEqual(quoteTotals(withCountry, "DE", 0).taxRows, [{ rate: 20, amount: 2000 }]);

// Stripe Tax: nothing is added here; Checkout calculates it.
const stripe = quoteTotals(basis(false, { stripeTax: true }), "DE", 1000);
assert.deepEqual(stripe, { shipping: 1000, taxRows: [], taxAmount: 0, total: 11000 });

// Placed orders report how they were taxed.
const placed = { subtotal: 10000, shipping: 1000, total: 11000, taxAmount: 1667, taxRate: 20, taxLines: [{ rate: 20, amount: 1667 }], discount: null };
assert.equal(orderTax({ ...placed, tax: { mode: "manual", inclusive: true } }).inclusive, true);
assert.equal(orderTax({ ...placed, tax: null }).inclusive, true, "older orders: no tax on top means inclusive");
assert.equal(orderTax({ ...placed, total: 12667, taxAmount: 1667, tax: null }).inclusive, false);
assert.deepEqual(orderTax({ ...placed, tax: { mode: "stripe", inclusive: false } }).rows, [{ rate: null, amount: 1667 }]);

// Validation.
assert.ok("zone" in checkZone({ name: "Europe", countries: ["de", "fr", "de"] }, []));
assert.deepEqual(checkZone({ name: "Europe", countries: ["de", "fr", "de"] }, []).zone.countries, ["DE", "FR"]);
assert.equal(checkZone({ name: "EU", countries: ["DE"] }, [europe]).problem.key, "countryTaken");
assert.equal(checkZone({ name: "EU", countries: ["XX"] }, []).problem.key, "unknownCountry");
assert.equal(checkZone({ name: "EU", countries: [] }, []).problem.key, "zoneCountries");

const base = { name: "Standard", kind: "flat", amount: 500, tiers: [], threshold: null, minDays: 2, maxDays: 4 };
assert.ok("rate" in checkRate(base));
assert.equal(checkRate({ ...base, minDays: 5, maxDays: 3 }).problem.key, "deliveryDays");
assert.equal(checkRate({ ...base, kind: "free_over", threshold: null }).problem.key, "threshold");
assert.equal(checkRate({ ...base, kind: "weight", tiers: [] }).problem.key, "tierCount");
assert.equal(
  checkRate({ ...base, kind: "weight", tiers: [{ upTo: 1000, amount: 100 }, { upTo: 500, amount: 200 }] }).problem.key,
  "tierOrder",
);
assert.equal(
  checkRate({ ...base, kind: "subtotal", tiers: [{ upTo: null, amount: 100 }, { upTo: 500, amount: 200 }] }).problem.key,
  "tierOpenEnd",
);
assert.deepEqual(checkTaxRates([{ country: "fr", rate: 20 }, { country: "DE", rate: 19 }]).rates, [
  { country: "DE", rate: 19 },
  { country: "FR", rate: 20 },
]);
assert.equal(checkTaxRates([{ country: "DE", rate: 19 }, { country: "de", rate: 7 }]).problem.key, "taxCountryTwice");
assert.equal(checkTaxRates([{ country: "DE", rate: 80 }]).problem.key, "taxRate");

console.log("shipping-check ok");

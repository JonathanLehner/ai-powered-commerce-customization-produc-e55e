// Self-check for bulk sourcing and its request for quote: npm run sourcing-check
import assert from "node:assert/strict";
import {
  checkQuoteAnswer,
  checkQuoteRequest,
  formatQuantity,
  indicativeRange,
  isQuoteOnly,
  QUOTE_STATUS_LABELS,
  QUOTE_STATUS_NOTES,
  QUOTE_STATUS_TONES,
  quoteCode,
  quoteIsUsable,
} from "../src/lib/sourcing.ts";
import { BULK_SOURCING_PRODUCTS } from "./bulk-sourcing-catalog.mjs";

const TODAY = new Date("2026-03-10T09:00:00.000Z");

/* ------------------------------------------- the listings in the catalog */

// Every bulk-sourcing listing is priced by quote and by nothing else. A unit
// cost left on one of these would be copied into a store as a real price and
// sold against, which is exactly the promise the platform cannot keep.
assert.ok(BULK_SOURCING_PRODUCTS.length > 0, "there are no bulk-sourcing listings to show");
for (const product of BULK_SOURCING_PRODUCTS) {
  assert.equal(product.supplierId, "sup_alibaba");
  assert.equal(product.status, "active", `${product.id} would not appear in the sourcing list`);
  assert.ok(isQuoteOnly(product), `${product.id} is not recognised as quote priced`);
  assert.equal(product.baseCost, 0, `${product.id} carries a unit cost it cannot honour`);
  assert.equal(product.customizationCostPerArea, 0);
  assert.equal(product.shippingEstimate, 0);
  for (const variant of product.variants) {
    assert.equal(variant.baseCost, 0, `${product.id}/${variant.sku} carries a unit cost`);
  }
  assert.ok(product.bulkSourcing.minimumOrderQuantity > 0);
  const [low, high] = product.bulkSourcing.indicativeUnitCost;
  assert.ok(low > 0 && high >= low, `${product.id} has an indicative band that reads backwards`);
  assert.ok(product.fulfillmentRegions.length > 0, `${product.id} delivers nowhere`);
  assert.ok(product.mockups.length > 0, `${product.id} would render a card with no photograph`);
  assert.ok(indicativeRange(product).includes("a unit"));
}

// The categories are the two the sourcing filter offers, so a listing cannot
// land in a category nothing selects.
for (const product of BULK_SOURCING_PRODUCTS) {
  assert.ok(["apparel", "drinkware"].includes(product.category), `${product.id} is in an unfiltered category`);
}

// A print-on-demand listing is not quote priced, whatever else it carries.
assert.equal(isQuoteOnly({ ...BULK_SOURCING_PRODUCTS[0], bulkSourcing: undefined }), false);
assert.equal(isQuoteOnly({ baseCost: 1090 }), false);

/* ------------------------------------------------------- the request form */

const target = {
  currency: "USD",
  fulfillmentRegions: ["North America", "European Union"],
  bulkSourcing: { minimumOrderQuantity: 500, indicativeUnitCost: [310, 520], responseDays: [2, 5], quoteNotes: "" },
};

const filled = {
  quantity: " 1,500 ",
  destination: "European Union",
  targetUnitCost: " 3.80 ",
  neededBy: "2026-06-01",
  customisation: "  Two-colour screen print front and back, woven neck label, individually polybagged.  ",
  contactName: "  Robin Vale  ",
  contactEmail: "  Robin@ValeAndCo.example ",
  submissionKey: "rfqfrm_abc123",
};

const accepted = checkQuoteRequest(filled, target, TODAY);
assert.equal(accepted.ok, true);
assert.deepEqual(accepted.value, {
  quantity: 1500,
  destination: "European Union",
  targetUnitCost: 380,
  neededBy: "2026-06-01",
  customisation: "Two-colour screen print front and back, woven neck label, individually polybagged.",
  contactName: "Robin Vale",
  contactEmail: "robin@valeandco.example",
  submissionKey: "rfqfrm_abc123",
});

// The optional fields are optional, and absent is not the same as wrong.
const sparse = checkQuoteRequest({ ...filled, targetUnitCost: "", neededBy: "" }, target, TODAY);
assert.equal(sparse.ok, true);
assert.equal(sparse.value.targetUnitCost, null);
assert.equal(sparse.value.neededBy, "");

// The minimum belongs to the supplier: a run under it comes back unanswered, so
// the form refuses it with the number that would work.
const refusals = [
  [{ ...filled, quantity: "499" }, "quantity"],
  [{ ...filled, quantity: "0" }, "quantity"],
  [{ ...filled, quantity: "" }, "quantity"],
  [{ ...filled, quantity: "many" }, "quantity"],
  [{ ...filled, quantity: "2000000" }, "quantity"],
  [{ ...filled, destination: "Antarctica" }, "destination"],
  [{ ...filled, destination: "" }, "destination"],
  [{ ...filled, targetUnitCost: "free" }, "targetUnitCost"],
  [{ ...filled, neededBy: "2020-01-01" }, "neededBy"],
  [{ ...filled, neededBy: "next spring" }, "neededBy"],
  [{ ...filled, customisation: "a tee" }, "customisation"],
  [{ ...filled, contactName: "R" }, "contactName"],
  [{ ...filled, contactEmail: "robin@" }, "contactEmail"],
];
for (const [input, field] of refusals) {
  const result = checkQuoteRequest(input, target, TODAY);
  assert.equal(result.ok, false, `${field} should have been refused`);
  assert.equal(result.field, field);
  assert.ok(result.message.length > 0, "a refusal always says what to correct");
}
assert.ok(
  checkQuoteRequest({ ...filled, quantity: "499" }, target, TODAY).message.includes("500 units"),
  "the refusal names the run size that would be quoted",
);

// Exactly the minimum is a run, and today is not yet past.
assert.equal(checkQuoteRequest({ ...filled, quantity: "500" }, target, TODAY).ok, true);
assert.equal(checkQuoteRequest({ ...filled, neededBy: "2026-03-10" }, target, TODAY).ok, true);

// A pasted specification is clamped rather than refused: losing the enquiry
// over its length would cost the store the run.
const long = checkQuoteRequest({ ...filled, customisation: "x".repeat(5000) }, target, TODAY);
assert.equal(long.ok, true);
assert.equal(long.value.customisation.length, 2000);

// No key means no de-duplication, which is allowed: the request still lands.
assert.equal(checkQuoteRequest({ ...filled, submissionKey: "" }, target, TODAY).value.submissionKey, "");

/* -------------------------------------------------------- the desk's reply */

const answer = checkQuoteAnswer(
  { unitCost: "4.15", leadTimeDays: "32", validUntil: "2026-05-01", notes: " FOB Ningbo. " },
  "USD",
);
assert.equal(answer.ok, true);
assert.deepEqual(answer.value, {
  unitCost: 415,
  leadTimeDays: 32,
  validUntil: "2026-05-01",
  notes: "FOB Ningbo.",
});
assert.equal(checkQuoteAnswer({ unitCost: "0", leadTimeDays: "32" }, "USD").field, "unitCost");
assert.equal(checkQuoteAnswer({ unitCost: "4.15", leadTimeDays: "0" }, "USD").field, "leadTimeDays");
assert.equal(checkQuoteAnswer({ unitCost: "4.15", leadTimeDays: "400" }, "USD").field, "leadTimeDays");
assert.equal(
  checkQuoteAnswer({ unitCost: "4.15", leadTimeDays: "32", validUntil: "soon" }, "USD").field,
  "validUntil",
);
// An expiry is optional, because not every supplier gives one.
assert.equal(checkQuoteAnswer({ unitCost: "4.15", leadTimeDays: "32", validUntil: "" }, "USD").ok, true);

/* ------------------------------------------- which quotes can still be used */

const quote = (patch) => ({
  status: "quoted",
  response: { unitCost: 415, leadTimeDays: 32, validUntil: "2026-05-01", notes: "", answeredBy: "Priya", answeredAt: "" },
  ...patch,
});

// A quote is what prices the copy, so only a live one may be copied against.
assert.equal(quoteIsUsable(quote(), TODAY), true);
assert.equal(quoteIsUsable(quote({ response: { ...quote().response, validUntil: "2026-03-10" } }), TODAY), true);
assert.equal(quoteIsUsable(quote({ response: { ...quote().response, validUntil: "2026-03-09" } }), TODAY), false);
assert.equal(quoteIsUsable(quote({ response: { ...quote().response, validUntil: "" } }), TODAY), true);
assert.equal(quoteIsUsable({ status: "submitted", response: null }, TODAY), false);
assert.equal(quoteIsUsable({ status: "declined", response: quote().response }, TODAY), false);
assert.equal(quoteIsUsable({ status: "withdrawn", response: null }, TODAY), false);
assert.equal(quoteIsUsable({ status: "quoted", response: null }, TODAY), false);

/* -------------------------------------------------------------- presentation */

// Every status a request can hold is named and toned for the badge that shows
// it, and says what happens next — a status with no label reads as a blank.
for (const status of ["submitted", "quoted", "declined", "withdrawn"]) {
  assert.ok(QUOTE_STATUS_LABELS[status], `${status} has no label`);
  assert.ok(QUOTE_STATUS_TONES[status], `${status} has no badge tone`);
  assert.ok(QUOTE_STATUS_NOTES[status].length > 20, `${status} does not say what happens next`);
}

assert.equal(formatQuantity(1), "1 unit");
assert.equal(formatQuantity(1000), "1,000 units");
assert.equal(quoteCode("rfq_abc123xyz"), "RFQ-123XYZ");
assert.ok(/^RFQ-[A-Z0-9]{1,6}$/.test(quoteCode("rfq_ab")));

console.log("sourcing-check: ok");

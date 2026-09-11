// Self-check for bulk sourcing enquiries and their quotes: npm run sourcing-check
import assert from "node:assert/strict";
import {
  acceptedQuote,
  canAcceptQuote,
  checkQuoteRequest,
  checkSupplierQuote,
  formatQuantity,
  indicativeRange,
  isOpenEnquiry,
  isQuoteOnly,
  QUOTE_STATUS_LABELS,
  QUOTE_STATUS_NOTES,
  QUOTE_STATUS_TONES,
  quoteCode,
  quoteIsLive,
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
  assert.ok(["apparel", "drinkware"].includes(product.category), `${product.id} is in an unfiltered category`);
}

// A print-on-demand listing is not quote priced, whatever else it carries.
assert.equal(isQuoteOnly({ ...BULK_SOURCING_PRODUCTS[0], bulkSourcing: undefined }), false);
assert.equal(isQuoteOnly({ baseCost: 1090 }), false);

/* ------------------------------------------------------- the enquiry form */

const listing = {
  currency: "USD",
  regions: ["North America", "European Union"],
  minimumOrderQuantity: 500,
  listingName: "Bulk Cut & Sew Tee",
};
const described = { ...listing, minimumOrderQuantity: 0, listingName: null };

const filled = {
  productName: "",
  description: "",
  quantity: " 1,500 ",
  destination: "European Union",
  targetUnitCost: " 3.80 ",
  neededBy: "2026-06-01",
  customisation: "  Two-colour screen print front and back, woven neck label, individually polybagged.  ",
  contactName: "  Robin Vale  ",
  contactEmail: "  Robin@ValeAndCo.example ",
  submissionKey: "rfqfrm_abc123",
};

// Against a listing, the listing names the product and the description is optional.
const accepted = checkQuoteRequest(filled, listing, TODAY);
assert.equal(accepted.ok, true);
assert.deepEqual(accepted.value, {
  productName: "Bulk Cut & Sew Tee",
  description: "",
  quantity: 1500,
  destination: "European Union",
  targetUnitCost: 380,
  neededBy: "2026-06-01",
  customisation: "Two-colour screen print front and back, woven neck label, individually polybagged.",
  contactName: "Robin Vale",
  contactEmail: "robin@valeandco.example",
  submissionKey: "rfqfrm_abc123",
});

// Described in the buyer's words, the name and a real description are required,
// and with no published minimum any positive run is asked about.
const tote = {
  ...filled,
  productName: " Recycled canvas tote ",
  description: "12oz recycled cotton canvas, 38 x 42 cm, long handles.",
  quantity: "250",
};
const own = checkQuoteRequest(tote, described, TODAY);
assert.equal(own.ok, true);
assert.equal(own.value.productName, "Recycled canvas tote");
assert.equal(own.value.quantity, 250);
assert.equal(checkQuoteRequest({ ...tote, productName: "" }, described, TODAY).field, "productName");
assert.equal(checkQuoteRequest({ ...tote, description: "a bag" }, described, TODAY).field, "description");

// The optional fields are optional, and absent is not the same as wrong.
const sparse = checkQuoteRequest({ ...filled, targetUnitCost: "", neededBy: "" }, listing, TODAY);
assert.equal(sparse.ok, true);
assert.equal(sparse.value.targetUnitCost, null);
assert.equal(sparse.value.neededBy, "");

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
  const result = checkQuoteRequest(input, listing, TODAY);
  assert.equal(result.ok, false, `${field} should have been refused`);
  assert.equal(result.field, field);
  assert.ok(result.message.length > 0, "a refusal always says what to correct");
}
// The minimum belongs to the supplier: the refusal names the run that would work.
assert.ok(checkQuoteRequest({ ...filled, quantity: "499" }, listing, TODAY).message.includes("500 units"));

// Exactly the minimum is a run, and today is not yet past.
assert.equal(checkQuoteRequest({ ...filled, quantity: "500" }, listing, TODAY).ok, true);
assert.equal(checkQuoteRequest({ ...filled, neededBy: "2026-03-10" }, listing, TODAY).ok, true);

// A pasted specification is clamped rather than refused.
const long = checkQuoteRequest({ ...filled, customisation: "x".repeat(5000) }, listing, TODAY);
assert.equal(long.ok, true);
assert.equal(long.value.customisation.length, 2000);

/* ----------------------------------------------------- a supplier's quote */

const quoteInput = {
  supplierLabel: " Ningbo Harbour Garments ",
  unitCost: "4.15",
  minimumOrderQuantity: "",
  leadTimeDays: "32",
  validUntil: "2026-05-01",
  notes: " FOB Ningbo. ",
};
const recorded = checkSupplierQuote(quoteInput, "USD", 1500);
assert.equal(recorded.ok, true);
assert.deepEqual(recorded.value, {
  supplierLabel: "Ningbo Harbour Garments",
  unitCost: 415,
  // A blank minimum is the run the store asked for.
  minimumOrderQuantity: 1500,
  leadTimeDays: 32,
  validUntil: "2026-05-01",
  notes: "FOB Ningbo.",
});
assert.equal(checkSupplierQuote({ ...quoteInput, minimumOrderQuantity: "2,000" }, "USD", 1500).value.minimumOrderQuantity, 2000);
assert.equal(checkSupplierQuote({ ...quoteInput, supplierLabel: "" }, "USD", 1500).field, "supplierLabel");
assert.equal(checkSupplierQuote({ ...quoteInput, unitCost: "0" }, "USD", 1500).field, "unitCost");
assert.equal(checkSupplierQuote({ ...quoteInput, minimumOrderQuantity: "lots" }, "USD", 1500).field, "minimumOrderQuantity");
assert.equal(checkSupplierQuote({ ...quoteInput, leadTimeDays: "0" }, "USD", 1500).field, "leadTimeDays");
assert.equal(checkSupplierQuote({ ...quoteInput, leadTimeDays: "400" }, "USD", 1500).field, "leadTimeDays");
assert.equal(checkSupplierQuote({ ...quoteInput, validUntil: "soon" }, "USD", 1500).field, "validUntil");
assert.equal(checkSupplierQuote({ ...quoteInput, validUntil: "" }, "USD", 1500).ok, true);

/* ------------------------------------------- which quotes can be accepted */

const q = (validUntil) => ({ id: "qte_1", validUntil });
assert.equal(quoteIsLive(q("2026-05-01"), TODAY), true);
assert.equal(quoteIsLive(q("2026-03-10"), TODAY), true);
assert.equal(quoteIsLive(q("2026-03-09"), TODAY), false);
assert.equal(quoteIsLive(q(""), TODAY), true);

// Only a live quote on an enquiry still collecting quotes can be accepted: a
// second accept, an expired price or a withdrawn enquiry all refuse.
assert.equal(canAcceptQuote({ status: "quoted" }, q("2026-05-01"), TODAY), true);
assert.equal(canAcceptQuote({ status: "quoted" }, q("2026-03-09"), TODAY), false);
for (const status of ["submitted", "accepted", "declined", "withdrawn"]) {
  assert.equal(canAcceptQuote({ status }, q("2026-05-01"), TODAY), false, `${status} accepted a quote`);
}

assert.equal(acceptedQuote({ quotes: [q(""), { id: "qte_2", validUntil: "" }], acceptedQuoteId: "qte_2" }).id, "qte_2");
assert.equal(acceptedQuote({ quotes: [q("")], acceptedQuoteId: null }), null);
assert.equal(acceptedQuote({ quotes: undefined, acceptedQuoteId: "qte_1" }), null);

// "Open" is what the store still has to act on or wait for: an accepted quote
// stays open until it has been copied into the catalog.
assert.equal(isOpenEnquiry({ status: "submitted", storeProductId: null }), true);
assert.equal(isOpenEnquiry({ status: "quoted", storeProductId: null }), true);
assert.equal(isOpenEnquiry({ status: "accepted", storeProductId: null }), true);
assert.equal(isOpenEnquiry({ status: "accepted", storeProductId: "prd_1" }), false);
assert.equal(isOpenEnquiry({ status: "declined", storeProductId: null }), false);
assert.equal(isOpenEnquiry({ status: "withdrawn", storeProductId: null }), false);

/* -------------------------------------------------------------- presentation */

for (const status of ["submitted", "quoted", "accepted", "declined", "withdrawn"]) {
  assert.ok(QUOTE_STATUS_LABELS[status], `${status} has no label`);
  assert.ok(QUOTE_STATUS_TONES[status], `${status} has no badge tone`);
  assert.ok(QUOTE_STATUS_NOTES[status].length > 20, `${status} does not say what happens next`);
}

assert.equal(formatQuantity(1), "1 unit");
assert.equal(formatQuantity(1000), "1,000 units");
assert.equal(quoteCode("rfq_abc123xyz"), "RFQ-123XYZ");
assert.ok(/^RFQ-[A-Z0-9]{1,6}$/.test(quoteCode("rfq_ab")));

console.log("sourcing-check: ok");

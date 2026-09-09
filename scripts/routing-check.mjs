// Self-check for supplier rerouting: npm run routing-check
import assert from "node:assert/strict";
import { orderRequirements, productFamily, routingChoices, unmetBy } from "../src/lib/supplier-routing.ts";

/* ------------------------------------------------------------- the catalog */

// Each catalog product carries the regions that product line is produced for.
// They are narrower than the supplier record on purpose: Gelato trades in
// Africa, but its tee is not made for it.
const catalog = [
  { id: "cat_tee_heavy", supplierId: "sup_printful", category: "apparel", productType: "T-shirt, 180 gsm", fulfillmentRegions: ["North America", "European Union"] },
  { id: "cat_hoodie_premium", supplierId: "sup_printful", category: "apparel", productType: "Hoodie, 320 gsm brushed fleece", fulfillmentRegions: ["North America", "European Union"] },
  { id: "cat_tee_organic", supplierId: "sup_gelato", category: "apparel", productType: "T-shirt, GOTS certified 180 gsm", fulfillmentRegions: ["North America", "European Union"] },
  { id: "cat_mug_classic", supplierId: "sup_gelato", category: "drinkware", productType: "Mug, 11oz white ceramic", fulfillmentRegions: ["North America", "European Union", "Africa"] },
  { id: "cat_mug_matte", supplierId: "sup_printify", category: "drinkware", productType: "Mug, 15oz matte black ceramic", fulfillmentRegions: ["North America", "Africa"] },
];

const api = { catalog: true, quotes: true, inventory: true, mockups: true, orderSubmission: true, tracking: true, cancellation: true };

const suppliers = [
  { id: "sup_printful", name: "Printful", kind: "print_on_demand", status: "approved", integration: "api", capabilities: api, leadTimeDays: [2, 5], regions: ["North America", "European Union"] },
  { id: "sup_gelato", name: "Gelato", kind: "print_on_demand", status: "approved", integration: "api", capabilities: api, leadTimeDays: [2, 6], regions: ["North America", "European Union", "Africa"] },
  { id: "sup_printify", name: "Printify", kind: "print_on_demand", status: "approved", integration: "api", capabilities: api, leadTimeDays: [3, 8], regions: ["North America", "Africa"] },
  { id: "sup_alibaba", name: "Alibaba.com", kind: "sourcing_marketplace", status: "approved", integration: "manual", capabilities: { ...api, orderSubmission: false }, leadTimeDays: [15, 45], regions: ["Africa"] },
  { id: "sup_gooten", name: "Gooten", kind: "print_on_demand", status: "pending_review", integration: "api", capabilities: api, leadTimeDays: [4, 9], regions: ["Africa"] },
];
// The sourcing marketplace lists the same tee, but orders are raised by hand.
catalog.push({ id: "cat_tee_bulk", supplierId: "sup_alibaba", category: "apparel", productType: "T-shirt, bulk 200 gsm", fulfillmentRegions: ["Africa", "APAC"] });
// Pending approval, and it makes the tee — approval is what keeps it out.
catalog.push({ id: "cat_tee_gooten", supplierId: "sup_gooten", category: "apparel", productType: "T-shirt, 190 gsm", fulfillmentRegions: ["Africa"] });

/* ------------------------------------------------ what the order needs made */

// Two suppliers describe the same garment differently; the family is what they agree on.
assert.equal(productFamily("T-shirt, 180 gsm"), "t-shirt");
assert.equal(productFamily("T-shirt, GOTS certified 180 gsm"), "t-shirt");
assert.equal(productFamily("Mug, 11oz white ceramic"), "mug");

const storeProducts = [
  { id: "prd_tee", catalogProductId: "cat_tee_heavy", category: "apparel" },
  { id: "prd_mug", catalogProductId: "cat_mug_classic", category: "drinkware" },
  { id: "prd_orphan", catalogProductId: "cat_deleted", category: "drinkware" },
];
const order = (items) => ({ items, storeId: "str_1", fulfillment: {}, customer: { country: "ZA" } });

const teeOrder = order([
  { storeProductId: "prd_tee", productName: "Northwind Field Tee", supplierId: "sup_printful" },
  { storeProductId: "prd_tee", productName: "Northwind Field Tee", supplierId: "sup_printful" },
]);
const teeNeeds = orderRequirements(teeOrder, storeProducts, catalog);
// Two lines of the same product are one thing to make, not two.
assert.deepEqual(teeNeeds, [{ label: "T-shirt", family: "t-shirt", category: "apparel" }]);

const mixedNeeds = orderRequirements(
  order([
    { storeProductId: "prd_tee", productName: "Field Tee", supplierId: "sup_printful" },
    { storeProductId: "prd_mug", productName: "Desk Mug", supplierId: "sup_gelato" },
  ]),
  storeProducts,
  catalog,
);
assert.deepEqual(mixedNeeds.map((r) => r.family), ["t-shirt", "mug"]);

// A catalog record that has gone falls back to the category, never to "anything".
const orphanNeeds = orderRequirements(
  order([{ storeProductId: "prd_orphan", productName: "Retired Tumbler", supplierId: "sup_gelato" }]),
  storeProducts,
  catalog,
);
assert.deepEqual(orphanNeeds, [{ label: "Retired Tumbler", family: null, category: "drinkware" }]);
assert.equal(unmetBy(catalog.filter((c) => c.supplierId === "sup_gelato"), orphanNeeds).length, 0);
assert.equal(unmetBy(catalog.filter((c) => c.supplierId === "sup_printful"), orphanNeeds).length, 1);

// With a region, only the products made for that region count. Gelato's tee is
// produced for the EU and not for Africa, which is what raises the exception on
// a Cape Town order in the first place.
const gelato = catalog.filter((c) => c.supplierId === "sup_gelato");
assert.equal(unmetBy(gelato, teeNeeds, "European Union").length, 0);
assert.equal(unmetBy(gelato, teeNeeds, "Africa").length, 1);
assert.equal(unmetBy(gelato, teeNeeds).length, 0);

/* ------------------------------------------------------- who can take the job */

const forRegion = (region, requirements, excludeSupplierId = "sup_printful") =>
  routingChoices({ suppliers, catalog, requirements, region, excludeSupplierId });

const africa = forRegion("Africa", teeNeeds);
// The supplier record says Gelato produces in Africa, but the tee it would make
// is not fulfilled there — the product record decides, so nothing is offered.
assert.deepEqual(africa.available.map((s) => s.id), []);
// Alibaba's bulk tee is made for Africa, but it cannot be sent a job.
assert.deepEqual(africa.manualOnly.map((s) => s.id), ["sup_alibaba"]);

// The supplier the job already failed on is never offered back, on either list.
const teeFailedOnAlibaba = forRegion("Africa", teeNeeds, "sup_alibaba");
assert.deepEqual(teeFailedOnAlibaba.available.map((s) => s.id), []);
assert.deepEqual(teeFailedOnAlibaba.manualOnly.map((s) => s.id), []);

// A mug into Africa: Gelato's mug is fulfilled there, so it qualifies — except
// for the order that is already sitting with Gelato and could not be produced.
const mugNeeds = orderRequirements(
  order([{ storeProductId: "prd_mug", productName: "Desk Mug", supplierId: "sup_gelato" }]),
  storeProducts,
  catalog,
);
assert.deepEqual(forRegion("Africa", mugNeeds, null).available.map((s) => s.id), ["sup_gelato", "sup_printify"]);
assert.deepEqual(forRegion("Africa", mugNeeds, "sup_gelato").available.map((s) => s.id), ["sup_printify"]);
// Alibaba sells no drinkware, so it is not offered as a manual fallback either.
assert.deepEqual(forRegion("Africa", mugNeeds, "sup_gelato").manualOnly.map((s) => s.id), []);

// A tee and a mug together: only a supplier making both, for that region, qualifies.
const bothEU = forRegion("European Union", mixedNeeds);
assert.deepEqual(bothEU.available.map((s) => s.id), ["sup_gelato"]);
// Gelato makes both, but only its mug reaches Africa, so a tee-and-mug order to
// Cape Town has nowhere to go: covering part of an order is not covering it.
assert.deepEqual(forRegion("Africa", mixedNeeds).available.map((s) => s.id), []);

// A region no approved supplier produces in leaves nothing to pick at all.
const middleEast = forRegion("Middle East", teeNeeds);
assert.deepEqual(middleEast.available, []);
assert.deepEqual(middleEast.manualOnly, []);

console.log("routing-check ok");

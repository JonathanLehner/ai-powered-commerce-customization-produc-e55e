// Self-check for supplier rerouting: npm run routing-check
import assert from "node:assert/strict";
import { orderRequirements, productFamily, routingChoices, unmetBy } from "../src/lib/supplier-routing.ts";

/* ------------------------------------------------------------- the catalog */

const catalog = [
  { id: "cat_tee_heavy", supplierId: "sup_printful", category: "apparel", productType: "T-shirt, 180 gsm" },
  { id: "cat_hoodie_premium", supplierId: "sup_printful", category: "apparel", productType: "Hoodie, 320 gsm brushed fleece" },
  { id: "cat_tee_organic", supplierId: "sup_gelato", category: "apparel", productType: "T-shirt, GOTS certified 180 gsm" },
  { id: "cat_mug_classic", supplierId: "sup_gelato", category: "drinkware", productType: "Mug, 11oz white ceramic" },
  { id: "cat_mug_matte", supplierId: "sup_printify", category: "drinkware", productType: "Mug, 15oz matte black ceramic" },
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
catalog.push({ id: "cat_tee_bulk", supplierId: "sup_alibaba", category: "apparel", productType: "T-shirt, bulk 200 gsm" });
// Pending approval, and it makes the tee — approval is what keeps it out.
catalog.push({ id: "cat_tee_gooten", supplierId: "sup_gooten", category: "apparel", productType: "T-shirt, 190 gsm" });

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

/* ------------------------------------------------------- who can take the job */

const forRegion = (region, requirements, currentSupplierId = "sup_printful") =>
  routingChoices({ suppliers, catalog, requirements, region, currentSupplierId });

const africa = forRegion("Africa", teeNeeds);
// Gelato produces in Africa and makes a tee. Printful is out of region, Printify
// makes no apparel, Gooten is not approved yet.
assert.deepEqual(africa.available.map((s) => s.id), ["sup_gelato"]);
// Alibaba covers the region and the garment but cannot be sent a job.
assert.deepEqual(africa.manualOnly.map((s) => s.id), ["sup_alibaba"]);

// A mug into Africa: Printify makes one and produces there, and the supplier the
// order already sits with stays on the list, flagged as the current one.
const mugAfrica = forRegion(
  "Africa",
  orderRequirements(
    order([{ storeProductId: "prd_mug", productName: "Desk Mug", supplierId: "sup_gelato" }]),
    storeProducts,
    catalog,
  ),
  "sup_gelato",
);
assert.deepEqual(mugAfrica.available.map((s) => [s.id, s.current]), [
  ["sup_gelato", true],
  ["sup_printify", false],
]);
// Alibaba sells no drinkware, so it is not offered as a manual fallback either.
assert.deepEqual(mugAfrica.manualOnly.map((s) => s.id), []);

// A tee and a mug together: only a supplier making both qualifies.
const bothEU = forRegion("European Union", mixedNeeds);
assert.deepEqual(bothEU.available.map((s) => s.id), ["sup_gelato"]);

// A region no approved supplier produces in leaves nothing to pick at all.
const middleEast = forRegion("Middle East", teeNeeds);
assert.deepEqual(middleEast.available, []);
assert.deepEqual(middleEast.manualOnly, []);

console.log("routing-check ok");

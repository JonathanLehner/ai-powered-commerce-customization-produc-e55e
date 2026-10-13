// Self-check for importing from Shopify: npm run shopify-import-check
//
// Asserts that:
// - Shopify's CSV exports are read in both the old and the 2024 column names:
//   quoted fields, line breaks inside quotes, products grouped by handle with
//   their options, variants, images, SEO fields, stock and costs;
// - every bad row is reported against its own line, and the rest still import;
// - files are posted in parts that never split a product or an order;
// - the import runs in the background in small batches, under a lease, so two
//   workers never import the same rows; it can be cancelled;
// - products land with their photos copied into the store's own storage,
//   variants with colour, size and weight, stock levels, SEO and a redirect
//   from the old address when the handle was taken; they wait as drafts until
//   the store links them to a catalog product or ships them itself, and keep
//   that choice when the file is imported again;
// - a product the store ships itself sells on its photos at the unit cost
//   entered, and its orders are not sent to a supplier; a linked one takes on
//   the catalog product's supplier, cost, print areas and mockups;
// - customers and orders follow, orders linked to products by SKU and the
//   customer records rebuilt from them;
// - importing the same file again updates instead of duplicating;
// - old Shopify addresses resolve: recorded redirects, nested product links
//   and /collections/all.
//
// No request leaves the machine: Shopify's CDN and the asset upload are mocked.
// It needs MONGODB_URI and MONGODB_DB from `.env.local`, and refuses to run against production.
import assert from "node:assert/strict";
import sharp from "sharp";
import { PRODUCTION_DB } from "./mongo.mjs";

if (!process.env.MONGODB_DB || process.env.MONGODB_DB === PRODUCTION_DB) {
  console.error("shopify-import-check writes test data: set MONGODB_DB to the development database (see .env.local).");
  process.exit(1);
}
process.env.CLAWCORP_API_KEY ||= "check-key";

const photo = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#c33" } }).jpeg().toBuffer();
let uploads = 0;
let downloads = 0;
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  if (url.startsWith("https://cdn.shopify.com/")) {
    downloads += 1;
    if (url.includes("missing")) return new Response("not found", { status: 404 });
    return new Response(photo, { status: 200, headers: { "content-type": "image/jpeg" } });
  }
  if (url === "https://www.clawcorp.ai/api/platform/upload") {
    uploads += 1;
    assert.equal(init.method, "POST");
    return Response.json({ url: `https://assets.clawcorp.ai/check/${uploads}.jpg`, bytes: photo.length });
  }
  throw new Error(`shopify-import-check makes no other network calls (${url})`);
};

const shopify = await import("../src/lib/shopify.ts");

/* --------------------------------------------------------------------- CSV */

const csv = shopify.parseCsv('﻿a,b,c\r\n1,"two, quoted","line\none"\n\n3,"say ""hi""",\n');
assert.deepEqual(csv.header, ["a", "b", "c"]);
assert.deepEqual(csv.records, [
  { line: 2, cells: ["1", "two, quoted", "line\none"] },
  { line: 5, cells: ["3", 'say "hi"', ""] },
], "quotes, commas and line breaks inside quotes; blank lines skipped; each record numbered by the line it starts on");

/* ---------------------------------------------------------------- products */

const PRODUCTS = [
  "Handle,Title,Body (HTML),Vendor,Product Category,Type,Tags,Published,Option1 Name,Option1 Value,Option2 Name,Option2 Value,Variant SKU,Variant Grams,Variant Inventory Tracker,Variant Inventory Qty,Variant Inventory Policy,Variant Price,Variant Compare At Price,Image Src,Image Position,Image Alt Text,Gift Card,SEO Title,SEO Description,Variant Image,Cost per item,Status",
  'field-tee,Field Tee,"<p>Soft <strong>cotton</strong> tee.</p><p>Two &amp; more.</p>",Rivet,Apparel > Shirts,T-Shirt,"summer, cotton",TRUE,Color,Black,Size,M,FT-BLK-M,180,shopify,12,deny,25.00,30.00,https://cdn.shopify.com/tee-front.jpg,1,Front,FALSE,Field Tee | Rivet,A soft tee.,https://cdn.shopify.com/tee-black.jpg,9.50,active',
  "field-tee,,,,,,,,,Black,,L,FT-BLK-L,190,shopify,0,deny,25.00,,https://cdn.shopify.com/tee-back.jpg,2,Back,,,,,9.50,",
  "field-tee,,,,,,,,,White,,M,FT-WHT-M,180,shopify,4,continue,26.50,,,,,,,,https://cdn.shopify.com/missing.jpg,9.50,",
  "field-tee,,,,,,,,,White,,M,FT-WHT-M2,180,shopify,4,deny,26.50,,,,,,,,,,",
  "camp-mug,Camp Mug,Enamel mug,Rivet,,Mug,,TRUE,Title,Default Title,,,MUG-1,350,,,deny,14,,https://cdn.shopify.com/mug.jpg,1,,FALSE,,,,4,draft",
  "bad-price,Bad Price,,,,,,TRUE,Title,Default Title,,,BP-1,0,,,deny,abc,,,,,FALSE,,,,,active",
  ",Orphan,,,,,,,,,,,,,,,,10,,,,,,,,,,",
  'gift,Gift Card,,,,,,TRUE,Denominations,$25,,,,,,,deny,25,,,,,TRUE,,,,,active',
].join("\n");

const read = shopify.readProducts(shopify.parseCsv(PRODUCTS), 2);
assert.equal(shopify.detectKind(shopify.parseCsv(PRODUCTS).header), "products");
const handles = read.products.map((p) => p.handle);
assert.deepEqual(handles, ["field-tee", "camp-mug", "gift"], "products are grouped by handle; unusable ones are left out");
const tee = read.products[0];
assert.equal(tee.title, "Field Tee");
assert.equal(tee.description, "Soft cotton tee.\n\nTwo & more.", "body HTML becomes paragraphs");
assert.deepEqual(tee.options, ["Color", "Size"]);
assert.deepEqual(tee.variants.map((v) => v.options.join("/")), ["Black/M", "Black/L", "White/M"]);
assert.deepEqual(tee.variants.map((v) => v.price), [2500, 2500, 2650], "prices in minor units");
assert.equal(tee.variants[0].compareAtPrice, 3000);
assert.equal(tee.variants[0].cost, 950);
assert.deepEqual(tee.variants.map((v) => v.grams), [180, 190, 180], "Variant Grams is the variant's weight");
assert.deepEqual(tee.variants.map((v) => v.quantity), [12, 0, 4], "stock tracked by Shopify");
assert.equal(tee.variants[2].policy, "continue");
assert.deepEqual(tee.tags, ["summer", "cotton"]);
assert.equal(tee.seoTitle, "Field Tee | Rivet");
assert.equal(tee.seoDescription, "A soft tee.");
assert.equal(tee.type, "T-Shirt");
assert.deepEqual(
  tee.images.map((i) => i.src),
  ["https://cdn.shopify.com/tee-front.jpg", "https://cdn.shopify.com/tee-back.jpg", "https://cdn.shopify.com/tee-black.jpg", "https://cdn.shopify.com/missing.jpg"],
  "product images in position order, then variant photos",
);
assert.equal(read.products[1].status, "draft");
assert.equal(read.products[1].variants[0].quantity, null, "untracked stock stays untracked");
const keys = read.issues.map((i) => `${i.line}:${i.key}`);
assert.ok(keys.includes("5:duplicateVariant"), "a repeated variant is reported on its line");
assert.ok(keys.includes("7:invalidPrice"), "a bad price is reported on its line");
assert.ok(keys.includes("8:missingHandle"), "a row without a handle is reported");
assert.ok(keys.includes("7:noVariants"), "a product left without variants is reported");

const NEW_FORMAT = [
  "Title,URL handle,Description,Vendor,Product category,Type,Tags,Published on online store,Status,SKU,Option1 name,Option1 value,Price,Compare-at price,Cost per item,Inventory tracker,Inventory quantity,Continue selling when out of stock,Weight value (grams),Product image URL,Image position,Image alt text,Variant image URL,Gift card,SEO title,SEO description",
  "Trail Cap,trail-cap,<p>Cap</p>,Rivet,,Hat,,TRUE,Active,CAP-1,Size,One size,\"1,299.00\",,500,shopify,7,FALSE,90,https://cdn.shopify.com/cap.jpg,1,Cap,,FALSE,Trail Cap,",
].join("\n");
const fresh = shopify.readProducts(shopify.parseCsv(NEW_FORMAT), 2);
assert.equal(fresh.products[0].handle, "trail-cap", "the 2024 export's column names are read too");
assert.equal(fresh.products[0].variants[0].price, 129900, "thousands separators are understood");
assert.equal(fresh.products[0].variants[0].quantity, 7);
assert.equal(fresh.products[0].variants[0].grams, 90);
assert.equal(shopify.gramsOf("", "0.35", "kg"), 350, "a weight with a unit is converted to grams");
assert.equal(shopify.gramsOf("", "12", "oz"), 340);
assert.equal(shopify.gramsOf("250.0", "9", "kg"), 250, "Variant Grams wins over the display weight");
assert.equal(shopify.readProducts(shopify.parseCsv("Title,Vendor\nx,y"), 2).issues[0].key, "missingColumns", "a file that is not a product export says so");
assert.equal(shopify.parseAmount("1.299", 2), 129900);
assert.equal(shopify.parseAmount("12,5", 2), 1250);
assert.equal(shopify.parseAmount("-3", 2), null);

/* ---------------------------------------------------- customers and orders */

const CUSTOMERS = [
  "First Name,Last Name,Email,Accepts Email Marketing,Default Address Company,Default Address Address1,Default Address Address2,Default Address City,Default Address Province Code,Default Address Country Code,Default Address Zip,Default Address Phone,Phone,Tags,Note",
  "Ada,Lovelace,ADA@example.com,yes,,1 Analytical Way,,London,,GB,N1 1AA,,+44 20 7946 0000,vip,Prefers email",
  "Bad,Email,not-an-email,no,,,,,,,,,,,",
  "Ada,Again,ada@example.com,no,,,,,,,,,,,",
].join("\n");
const customers = shopify.readCustomers(shopify.parseCsv(CUSTOMERS));
assert.equal(shopify.detectKind(shopify.parseCsv(CUSTOMERS).header), "customers");
assert.equal(customers.customers.length, 1);
assert.equal(customers.customers[0].email, "ada@example.com", "emails are lowercased");
assert.equal(customers.customers[0].address.country, "GB");
assert.deepEqual(customers.issues.map((i) => `${i.line}:${i.key}`), ["3:invalidEmail", "4:duplicateEmail"]);

const ORDERS = [
  "Name,Email,Financial Status,Paid at,Fulfillment Status,Fulfilled at,Currency,Subtotal,Shipping,Taxes,Total,Discount Code,Discount Amount,Shipping Method,Created at,Lineitem quantity,Lineitem name,Lineitem price,Lineitem sku,Shipping Name,Shipping Address1,Shipping Address2,Shipping City,Shipping Zip,Shipping Province,Shipping Country,Shipping Phone,Cancelled at,Refunded Amount",
  "#1001,ada@example.com,paid,2025-03-01 10:15:00 +0100,fulfilled,,USD,50.00,5.90,0.00,55.90,,0.00,Standard,2025-03-01 10:00:00 +0100,2,Field Tee - Black / M,25.00,FT-BLK-M,Ada Lovelace,1 Analytical Way,,London,N1 1AA,,GB,,,0.00",
  "#1002,ada@example.com,refunded,2025-04-01 09:00:00 +0000,unfulfilled,,USD,14.00,0.00,0.00,14.00,,0.00,,2025-04-01 09:00:00 +0000,1,Camp Mug,14.00,MUG-1,Ada Lovelace,1 Analytical Way,,London,N1 1AA,,GB,,,14.00",
  "#1002,,,,,,,,,,,,,,,1,Mystery Item,3.00,NOPE-1,,,,,,,,,,",
  "#1003,x@example.com,paid,,unfulfilled,,USD,1,0,0,abc,,,,2025-04-02 09:00:00 +0000,1,Thing,1.00,,,,,,,,,,,",
].join("\n");
const orders = shopify.readOrders(shopify.parseCsv(ORDERS), "USD");
assert.equal(shopify.detectKind(shopify.parseCsv(ORDERS).header), "orders");
assert.deepEqual(orders.orders.map((o) => `${o.name}:${o.items.length}`), ["#1001:1", "#1002:2"], "an order's line items are grouped by its name");
assert.equal(orders.orders[0].total, 5590);
assert.equal(orders.orders[0].createdAt, "2025-03-01T09:00:00.000Z", "Shopify's offset dates are read");
assert.deepEqual(orders.issues.map((i) => `${i.line}:${i.key}`), ["5:invalidTotal"]);

/* ------------------------------------------------------------------ chunks */

const big = shopify.parseCsv(PRODUCTS);
const parts = shopify.chunkRecords("products", big, 200);
assert.ok(parts.length > 1, "a large file is posted in parts");
for (const handle of ["field-tee"]) {
  const holding = parts.filter((part) => part.some((record) => record.cells[0] === handle));
  assert.equal(holding.length, 1, "a product is never split across two parts");
}
assert.equal(parts.flat().length, big.records.length, "no record is lost");

/* -------------------------------------------------------------- addresses */

assert.deepEqual(shopify.redirectRoute(["products", "Old-Tee"]), { lookup: "/products/old-tee", fallback: null });
assert.deepEqual(shopify.redirectRoute(["collections", "summer", "products", "field-tee"]), { lookup: "/products/field-tee", fallback: "/products/field-tee" });
assert.deepEqual(shopify.redirectRoute(["collections", "all"]), { lookup: "/collections/all", fallback: "/products" });
assert.equal(shopify.redirectRoute(["blog", "x"]), null);
assert.equal(shopify.redirectSource("https://old.myshopify.com/pages/About-Us?x=1"), "/pages/about-us");
assert.equal(shopify.redirectSource("/checkout"), null);
assert.equal(shopify.redirectTarget("//evil.example"), null, "a redirect cannot leave the store");
assert.equal(shopify.redirectTarget("/collections/summer"), "/collections/summer");

/* --------------------------------------------------------- against the db */

const { db, mongoClient, mongoDatabaseName } = await import("../src/lib/mongo.ts");
const { ensureIndexes } = await import("../src/lib/db-indexes.ts");
await ensureIndexes((await mongoClient()).db(mongoDatabaseName()));
const { COLLECTIONS } = await import("../src/lib/data.ts");
const runner = await import("../src/lib/shopify-import.ts");
const { saveRedirect } = await import("../src/lib/operations/shopify-import.ts");
const { shopifyRedirect } = await import("../src/lib/url-redirects.ts");
const { hasApprovedPreviews, importedPath } = await import("../src/lib/artwork.ts");
const { linkImportedProduct, markMerchantFulfilled } = await import("../src/lib/operations/products.ts");
const { publishBlockersFor } = await import("../src/lib/publish-blockers.ts");
const { routeOrder } = await import("../src/lib/fulfillment.ts");
const blockerReasons = async (product) => ((await publishBlockersFor([product], "en")).get(product.id) ?? []).map((b) => b.reason);

const quiet = { error: console.error, info: console.info };
console.error = () => {};
console.info = () => {};

const RUN = `shp${Date.now().toString(36)}`;
const template = (await db.findOne(COLLECTIONS.stores, { id: "str_rivet" })) ?? (await db.findOne(COLLECTIONS.stores, { status: "active" }));
const productTemplate = await db.findOne(COLLECTIONS.storeProducts, { storeId: template?.id });
const zoneTemplate = await db.findOne(COLLECTIONS.shippingZones, {});
const bracket = await db.findOne(COLLECTIONS.taxBrackets, {});
assert.ok(template && productTemplate && bracket, "the seeded stores are in the development database (npm run seed)");
const store = { ...template, id: `str_${RUN}`, slug: `shopify-check-${RUN}`, customDomain: null, defaultCurrency: "USD", currencies: ["USD"], defaultTaxBracketId: bracket.id };
delete store._id;
await db.insertOne(COLLECTIONS.stores, store);
if (zoneTemplate) {
  const zone = { ...zoneTemplate, id: `zone_${RUN}`, storeId: store.id };
  delete zone._id;
  await db.insertOne(COLLECTIONS.shippingZones, zone);
}
// A product already at /products/field-tee: the import's tee has to move.
const squatter = { ...productTemplate, id: `prd_${RUN}_old`, storeId: store.id, slug: "field-tee", imported: null };
delete squatter._id;
await db.insertOne(COLLECTIONS.storeProducts, squatter);
const actor = { id: "usr_shopify_check", name: "Shopify Check" };
const ctx = { store, actor, locale: "en" };

async function runImport(key) {
  let job = await runner.createImportJob(store, actor, key);
  for (const [kind, text] of [["products", PRODUCTS], ["customers", CUSTOMERS], ["orders", ORDERS]]) {
    const table = shopify.parseCsv(text);
    for (const [part, records] of shopify.chunkRecords(kind, table, 300).entries()) {
      job = await runner.appendImportPart(store, job, kind, part, table.header, records);
      // A retried part replaces itself.
      if (part === 0) job = await runner.appendImportPart(store, job, kind, part, table.header, records);
    }
  }
  job = await runner.queueImportJob(job);
  // Two workers at once, as two open progress pages would be.
  for (let i = 0; i < 50 && shopify.isJobOpen(job); i++) {
    const [a, b] = await Promise.all([runner.advanceImport(job.id, 3000), runner.advanceImport(job.id, 3000)]);
    job = a?.status === "done" ? a : (b ?? a);
    if (!shopify.isJobOpen(job)) break;
    // A worker only takes the lease once it has expired, so let it lapse between rounds.
    await db.updateOne(COLLECTIONS.shopifyImports, { id: job.id }, { $set: { leaseUntil: null } });
    job = await runner.getImport(store.id, job.id);
  }
  return job;
}

try {
  const again = await runner.createImportJob(store, actor, `key-${RUN}`);
  assert.equal((await runner.createImportJob(store, actor, `key-${RUN}`)).id, again.id, "a repeated start with the same key is the same import");
  await db.deleteOne(COLLECTIONS.shopifyImports, { id: again.id });

  const job = await runImport(`run-${RUN}`);
  assert.equal(job.status, "done", "the import finishes");
  assert.equal(shopify.jobProgress(job), 100);
  // The repeated customer sits in a later part here, so it is filed and then merged into the same record.
  assert.deepEqual(job.counts, { products: 3, customers: 2, orders: 2 }, "records received once, however often a part was posted");
  assert.deepEqual(job.created, { products: 2, customers: 1, orders: 2 });
  assert.equal(job.updated.customers, 1, "one customer per email");
  assert.equal(job.failed.products, 1, "the gift card product is skipped");
  const issues = shopify.jobIssues(job);
  for (const key of ["duplicateVariant", "invalidPrice", "missingHandle", "invalidEmail", "invalidTotal", "imageFailed", "unmatchedProduct", "giftCardSkipped"]) {
    assert.ok(issues.some((issue) => issue.key === key), `the report lists ${key}`);
  }
  assert.equal(await db.count(COLLECTIONS.shopifyImportRows, { importId: job.id }), 0, "the staged rows are cleared");

  const products = await db.find(COLLECTIONS.storeProducts, { storeId: store.id, "imported.platform": "shopify" });
  assert.equal(products.length, 2, "each product once, even with two workers");
  const importedTee = products.find((p) => p.imported.handle === "field-tee");
  assert.equal(importedTee.slug, "field-tee-2", "a taken handle gets a new address");
  assert.equal((await db.findOne(COLLECTIONS.urlRedirects, { storeId: store.id, path: "/products/field-tee" }))?.target, "/products/field-tee-2", "and a redirect from the old one");
  assert.deepEqual(importedTee.variants.map((v) => [v.colour, v.size, v.sku, v.price]), [
    ["Black", "M", "FT-BLK-M", 2500],
    ["Black", "L", "FT-BLK-L", 2500],
    ["White", "M", "FT-WHT-M", 2650],
  ], "options become colour and size");
  assert.equal(importedTee.variants[1].availability, "out_of_stock");
  assert.equal(importedTee.seoTitle, "Field Tee | Rivet");
  assert.equal(importedTee.mockups.length, 3, "three photos copied; the missing one is reported");
  assert.ok(importedTee.mockups.every((m) => m.url.startsWith("https://assets.clawcorp.ai/")), "photos live in the store's own storage");
  assert.equal(importedTee.mockups.find((m) => m.colour === "Black")?.view, "front", "a variant photo is tied to its colour");
  assert.ok(hasApprovedPreviews(importedTee), "an imported product needs only its photos to sell");
  assert.deepEqual(importedTee.variants.map((v) => v.weightGrams), [180, 190, 180], "Variant Grams becomes the variant weight");
  assert.equal(importedPath(importedTee), "unlinked");
  assert.equal(importedTee.status, "draft", "an import nobody has linked or chosen to ship waits as a draft");
  assert.ok((await blockerReasons(importedTee)).some((r) => /not linked to a supplier yet/.test(r)), "and says why");
  assert.ok(!(await blockerReasons(importedTee)).some((r) => /retired|mockups/i.test(r)), "never as a retired product or for want of mockups");
  const mug = products.find((p) => p.imported.handle === "camp-mug");
  assert.equal(mug.status, "draft", "a Shopify draft stays a draft");
  assert.equal(mug.category, "drinkware");
  const levels = await db.find(COLLECTIONS.inventoryLevels, { productId: importedTee.id });
  assert.deepEqual(levels.map((l) => [l.onHand, l.policy]).sort(), [[0, "deny"], [12, "deny"], [4, "continue"]].sort(), "stock levels are set");

  const ada = await db.findOne(COLLECTIONS.customers, { storeId: store.id, email: "ada@example.com" });
  assert.equal(ada.name, "Ada Lovelace");
  assert.equal(ada.marketing.subscribed, true);
  assert.equal(ada.orderCount, 2, "the customer record is rebuilt from the imported orders");
  assert.equal(ada.lifetimeSpend, 5590, "a refunded order does not count toward spend");
  assert.equal(ada.notes[0]?.body, "Prefers email");

  const imported = await db.find(COLLECTIONS.orders, { storeId: store.id, "imported.platform": "shopify" });
  const first = imported.find((o) => o.imported.name === "#1001");
  assert.equal(first.status, "delivered");
  assert.equal(first.items[0].storeProductId, importedTee.id, "a line is linked to its product by SKU");
  assert.equal(first.payment.status, "succeeded");
  const second = imported.find((o) => o.imported.name === "#1002");
  assert.equal(second.status, "cancelled");
  assert.equal(second.payment.status, "refunded");
  assert.equal(second.items[1].storeProductId, "", "an unknown SKU keeps its line without a product");

  // Shipped by the store: a unit cost below every price, photos in place of mockups.
  await assert.rejects(markMerchantFulfilled(ctx, importedTee, 2500), /sells for/, "a unit cost at a variant's price is refused");
  await assert.rejects(markMerchantFulfilled(ctx, importedTee, null), /unit cost/i);
  const own = await markMerchantFulfilled(ctx, importedTee, 900);
  assert.equal(importedPath(own), "merchant");
  assert.ok(own.variants.every((v) => v.baseCost === 900));
  assert.equal(own.costs.supplierCost, 900);
  assert.ok(own.costs.marginPct > 0 && own.costs.marginPct < 100, "the margin is worked out from the unit cost");
  assert.deepEqual(await blockerReasons(own), zoneTemplate ? [] : ["The store has no shipping zones."], "nothing else stands in the way");
  assert.equal((await markMerchantFulfilled(ctx, own, 950)).merchantFulfilled.unitCost, 950, "saving again changes the unit cost");
  const routed = await routeOrder({ storeId: store.id, code: "ORD-X", items: [{ storeProductId: own.id, supplierId: "" }], fulfillment: {}, customer: { country: "US" } }, store);
  assert.equal(routed.routing, "manual_required");
  assert.equal(routed.exception, null, "an order for it is the store's to ship, not an exception");

  // Linked to a catalog product: its supplier, cost, print areas and mockups.
  const listing = await db.findOne(COLLECTIONS.catalog, { category: "drinkware", status: "active", "bulkSourcing.minimumOrderQuantity": { $not: { $gt: 0 } }, "variants.0": { $exists: true } });
  assert.ok(listing, "the seeded catalog has a drinkware product (npm run seed)");
  {
    const linked = await linkImportedProduct(ctx, mug, listing.id);
    assert.equal(importedPath(linked), "linked");
    assert.equal(linked.catalogProductId, listing.id);
    assert.equal(linked.supplierId, listing.supplierId);
    assert.ok(linked.variants.every((v) => listing.variants.some((c) => c.id === v.catalogVariantId && c.baseCost === v.baseCost)), "variants take the catalog product's cost");
    assert.ok(linked.mockups.length > 0 && linked.mockups.every((m) => !m.approved), "its base mockups come over, awaiting approval");
    const reasons = await blockerReasons(linked);
    assert.ok(!reasons.some((r) => /not linked/.test(r)) && reasons.some((r) => /artwork/i.test(r)), "from here it is published like any catalog product");
    assert.equal((await linkImportedProduct(ctx, linked, listing.id)).id, linked.id, "linking again changes nothing");
    await assert.rejects(markMerchantFulfilled(ctx, linked, 100), /already linked/);
  }

  // The same files again: updated, not duplicated, and no photo copied twice.
  const uploadsBefore = uploads;
  const rerun = await runImport(`rerun-${RUN}`);
  assert.equal(rerun.status, "done");
  assert.equal(rerun.created.products, 0);
  assert.equal(rerun.updated.products, 2, "a second import updates the products it made");
  assert.equal(rerun.created.orders, 0, "and leaves orders it already has");
  assert.equal(await db.count(COLLECTIONS.storeProducts, { storeId: store.id, "imported.platform": "shopify" }), 2);
  assert.equal(uploads, uploadsBefore, "photos copied before are reused");
  const keptOwn = await db.findOne(COLLECTIONS.storeProducts, { id: importedTee.id });
  assert.equal(keptOwn.merchantFulfilled?.unitCost, 950, "importing again keeps the store's own fulfilment");
  assert.ok(keptOwn.variants.every((v) => v.baseCost === 950));
  {
    const keptLink = await db.findOne(COLLECTIONS.storeProducts, { id: mug.id });
    assert.equal(keptLink.catalogProductId, listing.id, "and a link to a catalog product");
  }

  // Cancelling stops a running import and drops what it had not done.
  let cancelled = await runner.createImportJob(store, actor, `cancel-${RUN}`);
  const table = shopify.parseCsv(PRODUCTS);
  cancelled = await runner.appendImportPart(store, cancelled, "products", 0, table.header, table.records);
  cancelled = await runner.queueImportJob(cancelled);
  cancelled = await runner.cancelImportJob(cancelled);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(await db.count(COLLECTIONS.shopifyImportRows, { importId: cancelled.id, status: "pending" }), 0);
  assert.equal((await runner.advanceImport(cancelled.id, 1000))?.status, "cancelled", "a cancelled import never resumes");

  // Redirects a merchant adds, and Shopify's nested addresses.
  await saveRedirect(ctx, { path: "https://old.myshopify.com/pages/About-Us", target: "/pages/about" });
  assert.equal(await shopifyRedirect(store.id, ["pages", "about-us"]), "/pages/about");
  assert.equal(await shopifyRedirect(store.id, ["collections", "summer", "products", "field-tee"]), "/products/field-tee-2", "a nested product link follows the product's redirect");
  assert.equal(await shopifyRedirect(store.id, ["collections", "all"]), "/products");
  assert.equal(await shopifyRedirect(store.id, ["pages", "nothing-here"]), null, "an address with no redirect stays a 404");
  await assert.rejects(saveRedirect(ctx, { path: "/checkout", target: "/" }), /products|collections|pages/i);
  await assert.rejects(saveRedirect(ctx, { path: "/pages/a", target: "https://evil.example//x" }));

  console.error = quiet.error;
  console.info = quiet.info;
  console.log(`shopify-import-check ok: ${downloads} photo downloads and ${uploads} uploads, all mocked`);
} finally {
  console.error = quiet.error;
  console.info = quiet.info;
  const filter = { storeId: store.id };
  const productIds = (await db.find(COLLECTIONS.storeProducts, filter)).map((p) => p.id);
  await db.deleteMany(COLLECTIONS.inventoryLevels, { productId: { $in: productIds } });
  await db.deleteMany(COLLECTIONS.inventoryAdjustments, filter);
  for (const name of ["storeProducts", "orders", "customers", "urlRedirects", "shopifyImports", "shopifyImportRows", "shippingZones", "audit"]) {
    await db.deleteMany(COLLECTIONS[name], filter);
  }
  await db.deleteMany(COLLECTIONS.stores, { id: store.id });
}
process.exit(0);

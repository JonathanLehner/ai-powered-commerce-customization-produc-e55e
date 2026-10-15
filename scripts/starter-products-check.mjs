// Self-check for a template's suggested products: npm run starter-products-check
//
// Adds the Roastery template's starter products to throwaway stores in the
// development database and asserts that each arrives in the demo's colour, at
// the demo's rounded price, with the template's artwork placed inside the
// print area and its product shot as the preview, that adding them twice adds
// nothing, that they take the store's default tax bracket once it is set, and
// that "Publish starter products" follows the catalog's bulk Publish rules:
// nothing goes live until its mockups are approved, then all of it does. The Wax template's poster, tote
// and sticker check the newer blanks: the poster sheet printed edge to edge,
// the rest passing pre-flight. It refuses to run against production.
import assert from "node:assert/strict";
import { PRODUCTION_DB } from "./mongo.mjs";

if (!process.env.MONGODB_DB || process.env.MONGODB_DB === PRODUCTION_DB) {
  console.error("starter-products-check writes test data: set MONGODB_DB to the development database (see .env.local).");
  process.exit(1);
}
globalThis.fetch = async (url) => {
  throw new Error(`starter-products-check makes no network calls (${url})`);
};

const { db } = await import("../src/lib/mongo.ts");
const { COLLECTIONS, getCatalogProduct, listStoreProducts } = await import("../src/lib/data.ts");
const { blockingIssues, validateArtwork } = await import("../src/lib/artwork.ts");
const { addStarterProducts, isUnpublishedStarter, publishStarterProducts } = await import("../src/lib/operations/templates.ts");
const { bulkUpdateProducts } = await import("../src/lib/operations/products.ts");
const { saveDefaultTax } = await import("../src/lib/operations/store-settings.ts");
const { getTemplate } = await import("../src/lib/templates/index.ts");
const { starterPrice } = await import("../src/lib/templates/demo.ts");

const quiet = console.error;
console.error = () => {};

const RUN = `stp${Date.now().toString(36)}`;
const template = getTemplate("roastery");
const base = await db.findOne(COLLECTIONS.stores, { id: "str_rivet" });
assert.ok(base, "the seeded rivet-hardware store is in the development database (npm run seed)");
const stores = [];
function makeStore(suffix, extra) {
  const store = {
    ...base,
    id: `str_${RUN}_${suffix}`,
    slug: `starter-check-${RUN}-${suffix}`,
    channelCode: `starter-${suffix}`,
    customDomain: null,
    demo: true,
    defaultTaxBracketId: null,
    pricesIncludeTax: false,
    ...extra,
  };
  delete store._id;
  stores.push(store);
  return store;
}

try {
  // Prices: the demo's own figure in the demo's currency, rounded whole units otherwise.
  assert.equal(starterPrice(1800, "USD", "en"), 1800);
  assert.equal(starterPrice(5800, "EUR", "de"), 5800);
  assert.equal(starterPrice(1800, "JPY", "ja"), 2700, "JPY is written in yen, as the demo shows it");
  assert.equal(starterPrice(1800, "EUR", "en") % 100, 0, "a converted price is a whole unit");

  /* ------------------------------------------------- a USD store, English */
  const store = makeStore("usd", { defaultCurrency: "USD", currencies: ["USD"], defaultLanguage: "en", languages: ["en"] });
  await db.insertOne(COLLECTIONS.stores, store);
  const ctx = { store, actor: { id: "usr_starter_check", name: "Starter Check" }, locale: "en" };

  const added = await addStarterProducts(ctx, template);
  assert.equal(added.length, template.products.length, "every suggested product is added");
  assert.deepEqual(await addStarterProducts(ctx, template), [], "adding the same template again adds nothing");

  const products = await listStoreProducts(store.id);
  assert.deepEqual(
    template.products.map((item) => products.find((p) => p.name === item.name)?.price),
    [1800, 2400, 2200, 3200, 2800, 2200, 5800],
    "each product is priced like the demo",
  );
  for (const [index, item] of template.products.entries()) {
    const product = products.find((p) => p.importKey === `template:roastery:${index}`);
    assert.ok(product, `${item.name} is in the catalog`);
    assert.equal(product.status, "draft");
    assert.ok(isUnpublishedStarter(product));
    assert.equal(product.mockups.length, 1, `${item.name} has a preview`);
    assert.equal(product.mockups[0].url, template.assets.products[index], `${item.name} shows the demo's product photo`);
    assert.ok(product.variants.every((v) => v.price === product.price), "every size sells at the demo price");
    const enabled = product.variants.filter((v) => v.enabled);
    assert.ok(enabled.length > 0 && enabled.every((v) => v.colour === item.colour), `${item.name} sells in ${item.colour}`);
    assert.equal(product.artworks.length, 1, `${item.name} carries the template's artwork`);
    const catalog = await getCatalogProduct(product.catalogProductId);
    const area = catalog.printAreas.find((a) => a.id === product.artworks[0].printAreaId);
    assert.equal(area.view, product.mockups[0].view, "the artwork is on the side the photo shows");
    assert.deepEqual(blockingIssues(validateArtwork(product.artworks[0], area, catalog.fileRequirements)), [], `${item.name} passes pre-flight`);
    assert.ok(product.costs.marginAmount > 0, `${item.name} sells above cost`);
    if (item.placement === "left-chest") {
      assert.ok(product.artworks[0].x > 0.7 && product.artworks[0].scale <= 0.3, `${item.name} carries a small left-chest print`);
    }
  }

  // Publishing waits for what the store itself lacks, and says so.
  const blocked = await publishStarterProducts(ctx);
  assert.equal(blocked.succeeded.length, 0);
  assert.equal(blocked.failed.length, template.products.length);
  assert.match(blocked.failed[0].reason, /shipping zone/i);

  // With a shipping zone and the store's default tax bracket, only approval is left.
  const now = new Date().toISOString();
  await db.insertOne(COLLECTIONS.shippingZones, {
    id: `shz_${RUN}`,
    storeId: store.id,
    name: "Everywhere",
    countries: ["US"],
    currency: "USD",
    rates: [{ id: `rate_${RUN}`, name: "Standard", amount: 500, minDays: 3, maxDays: 6 }],
    createdAt: now,
    updatedAt: now,
  });
  assert.ok((await listStoreProducts(store.id)).every((p) => p.taxBracketId === null), "the store had no default bracket yet");
  await saveDefaultTax(ctx, { defaultTaxBracketId: "tax_us825", pricesIncludeTax: false });
  const filed = await listStoreProducts(store.id);
  assert.ok(filed.every((p) => p.taxBracketId === "tax_us825"), "every product takes the store's default bracket");
  assert.ok(filed.every((p) => p.costs.taxBracketId === "tax_us825"), "and is costed under it");

  const unapproved = await publishStarterProducts(ctx);
  assert.equal(unapproved.succeeded.length, 0, "the editor publishes nothing the catalog would not");
  assert.ok(unapproved.failed.every((f) => /approved/i.test(f.reason) && !/tax bracket/i.test(f.reason)), "mockup approval is all that is left");

  const approved = await bulkUpdateProducts(ctx, added, { kind: "approve" });
  assert.equal(approved.succeeded.length, template.products.length, "one bulk action approves every mockup");
  assert.equal((await bulkUpdateProducts(ctx, added, { kind: "approve" })).succeeded.length, 0, "approving again changes nothing");

  const outcome = await publishStarterProducts(ctx);
  assert.deepEqual(outcome.failed, [], "nothing stays back");
  assert.equal(outcome.succeeded.length, template.products.length);
  const live = await listStoreProducts(store.id);
  assert.ok(live.every((p) => p.status === "published" && p.mockups.every((m) => m.approved)), "all published with approved photos");
  assert.equal(live.filter(isUnpublishedStarter).length, 0, "the editor's notice goes away");

  /* ------------------------------------------------- a EUR store, German */
  const euro = makeStore("eur", { defaultCurrency: "EUR", currencies: ["EUR"], defaultLanguage: "de", languages: ["de"] });
  await db.insertOne(COLLECTIONS.stores, euro);
  await addStarterProducts({ ...ctx, store: euro }, template);
  const euroProducts = await listStoreProducts(euro.id);
  assert.deepEqual(
    template.products.map((_, i) => euroProducts.find((p) => p.importKey === `template:roastery:${i}`)?.price),
    [1800, 2400, 2200, 3200, 2800, 2200, 5800],
    "a German store sells at the German demo's euro prices",
  );
  assert.ok(euroProducts.every((p) => p.currency === "EUR"));

  /* --------------------------- the newer blanks: poster, tote, sticker */
  const wax = getTemplate("wax");
  const waxStore = makeStore("wax", { defaultCurrency: "USD", currencies: ["USD"], defaultLanguage: "en", languages: ["en"] });
  await db.insertOne(COLLECTIONS.stores, waxStore);
  await addStarterProducts({ ...ctx, store: waxStore }, wax);
  const waxProducts = await listStoreProducts(waxStore.id);
  assert.equal(waxProducts.length, wax.products.length, "every Wax product is added");
  for (const [index, item] of wax.products.entries()) {
    const product = waxProducts.find((p) => p.importKey === `template:wax:${index}`);
    const catalog = await getCatalogProduct(product.catalogProductId);
    const area = catalog.printAreas.find((a) => a.id === product.artworks[0].printAreaId);
    assert.deepEqual(blockingIssues(validateArtwork(product.artworks[0], area, catalog.fileRequirements)), [], `${item.name} passes pre-flight`);
    if (item.starter === "poster") {
      assert.equal(product.artworks[0].url, wax.assets.artwork.poster.url, "the poster prints the poster sheet");
      assert.equal(product.artworks[0].scale, 1, "the poster sheet fills the paper");
    }
  }
} finally {
  await Promise.all(
    stores.flatMap((store) => [
      db.deleteMany(COLLECTIONS.stores, { id: store.id }),
      db.deleteMany(COLLECTIONS.storeProducts, { storeId: store.id }),
      db.deleteMany(COLLECTIONS.shippingZones, { storeId: store.id }),
      db.deleteMany(COLLECTIONS.audit, { storeId: store.id }),
      db.deleteMany(COLLECTIONS.notifications, { storeId: store.id }),
    ]),
  );
  console.error = quiet;
}

console.log("starter-products-check ok: demo prices, photos and artwork; default bracket; approved, then published");
process.exit(0);

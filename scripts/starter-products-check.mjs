// Self-check for a template's suggested products: npm run starter-products-check
//
// Adds the Roastery template's starter products to throwaway stores in the
// development database and asserts that each arrives in the demo's colour, at
// the demo's rounded price, with the template's artwork placed inside the
// print area and its product shot as the preview, that adding them twice adds
// nothing, and that "Publish starter products" puts them all on sale in one
// step once the store can ship and tax them. It refuses to run against
// production.
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
    [1800, 2200, 3200, 5800, 3000],
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
  }

  // Publishing waits for what the store itself lacks, and says so.
  const blocked = await publishStarterProducts(ctx);
  assert.equal(blocked.succeeded.length, 0);
  assert.equal(blocked.failed.length, template.products.length);
  assert.match(blocked.failed[0].reason, /shipping zone/i);

  // With a shipping zone and a tax bracket, one step puts them all on sale.
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
  await db.updateMany(COLLECTIONS.storeProducts, { storeId: store.id }, { $set: { taxBracketId: "tax_us825" } });
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
    [1800, 2200, 3200, 5800, 3000],
    "a German store sells at the German demo's euro prices",
  );
  assert.ok(euroProducts.every((p) => p.currency === "EUR"));
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

console.log("starter-products-check ok: demo prices, photos and artwork; published in one step");
process.exit(0);

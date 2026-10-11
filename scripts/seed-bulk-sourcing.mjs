/**
 * Puts the bulk-sourcing listings into the shared catalog of a database that is
 * already live, without touching anything else in it.
 *
 * `seed.mjs` rebuilds the whole demo tenancy from scratch and would throw away
 * every store, order and quote request along with it. This writes the three
 * Alibaba.com listings and nothing more: each one is replaced if it is already
 * there, so running it twice is the same as running it once.
 *
 * Run: node --env-file=.env.local scripts/seed-bulk-sourcing.mjs
 */
import { BULK_SOURCING_PRODUCTS } from "./bulk-sourcing-catalog.mjs";
import { openDatabase } from "./mongo.mjs";

const { client, dbCall } = await openDatabase({ devOnly: true });

const supplier = await dbCall({ collection: "suppliers", action: "findOne", filter: { id: "sup_alibaba" } });
if (!supplier) {
  console.error("sup_alibaba is not in the suppliers collection — run scripts/seed.mjs first.");
  process.exit(1);
}

for (const product of BULK_SOURCING_PRODUCTS) {
  const existing = await dbCall({
    collection: "catalog_products",
    action: "findOne",
    filter: { id: product.id },
  });
  if (existing) {
    // The listing is replaced field by field rather than deleted and rewritten,
    // so its original creation date survives a re-run.
    await dbCall({
      collection: "catalog_products",
      action: "updateOne",
      filter: { id: product.id },
      update: { $set: { ...product, createdAt: existing.createdAt ?? product.createdAt } },
    });
    console.log(`updated ${product.id}`);
  } else {
    await dbCall({ collection: "catalog_products", action: "insertOne", document: product });
    console.log(`inserted ${product.id}`);
  }
}

const total = await dbCall({
  collection: "catalog_products",
  action: "countDocuments",
  filter: { supplierId: "sup_alibaba" },
});
console.log(`bulk sourcing: ${JSON.stringify(total)} listing(s) under ${supplier.name}`);
await client.close();

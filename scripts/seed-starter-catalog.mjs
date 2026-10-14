/**
 * Puts the template blanks (totes, caps, beanies, posters, stickers, scarves,
 * kit shirts and enamel mugs) into the shared catalog of a database that is
 * already live, without touching anything else in it. A template's starter
 * products are copied from these, so a template that suggests one only adds
 * it once it is here.
 *
 * Each product is replaced field by field if it is already there, keeping its
 * creation date, so running it twice is the same as running it once. Run it
 * on the development database and on production:
 *
 *   node --env-file=.env.local scripts/seed-starter-catalog.mjs
 *   MONGODB_DB=parcelith node --env-file=.env.local scripts/seed-starter-catalog.mjs
 */
import { openDatabase } from "./mongo.mjs";
import { STARTER_CATALOG_PRODUCTS } from "./starter-catalog.mjs";

const { client, dbCall } = await openDatabase();

for (const product of STARTER_CATALOG_PRODUCTS) {
  const supplier = await dbCall({ collection: "suppliers", action: "findOne", filter: { id: product.supplierId } });
  if (!supplier) {
    console.error(`${product.supplierId} is not in the suppliers collection; skipped ${product.id}`);
    continue;
  }
  const existing = await dbCall({ collection: "catalog_products", action: "findOne", filter: { id: product.id } });
  if (existing) {
    await dbCall({
      collection: "catalog_products",
      action: "updateOne",
      filter: { id: product.id },
      update: { $set: { ...product, createdAt: existing.createdAt ?? product.createdAt } },
    });
    console.log(`updated  ${product.id}`);
  } else {
    await dbCall({ collection: "catalog_products", action: "insertOne", document: product });
    console.log(`inserted ${product.id}`);
  }
}
await client.close();

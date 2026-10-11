/**
 * Writes the demo stores' content from `store-content.mjs` over the stored
 * records: storefront drafts and published pages, products, gift portal intros
 * and the languages a store offers. Ids, slugs, prices and images are left as
 * they are. Safe to run again: a record that already matches is not written.
 *
 *   node --env-file=.env.local scripts/rewrite-store-content.mjs            # MONGODB_DB from .env.local
 *   MONGODB_DB=parcelith node --env-file=.env.local scripts/rewrite-store-content.mjs --dry-run
 */
import { openDatabase } from "./mongo.mjs";
import { STORE_CONTENT, productFieldsFor, storedTranslations, withStoreContent } from "./store-content.mjs";

const dryRun = process.argv.includes("--dry-run");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const now = new Date().toISOString();

const { client, db } = await openDatabase();
let writes = 0;

async function write(collection, filter, set, label) {
  console.log(`  ${dryRun ? "would update" : "update"} ${label}`);
  writes += 1;
  if (!dryRun) await db.collection(collection).updateOne(filter, { $set: set });
}

try {
  for (const content of STORE_CONTENT) {
    const store = await db.collection("stores").findOne({ id: content.storeId });
    if (!store) {
      console.log(`${content.slug}: not in this database, skipped`);
      continue;
    }
    console.log(content.slug);

    if (content.languages && !same(store.languages, content.languages)) {
      await write("stores", { id: store.id }, { languages: content.languages }, "store languages");
    }

    const storefront = await db.collection("storefronts").findOne({ storeId: store.id });
    if (storefront) {
      const set = {};
      for (const key of ["draft", "published"]) {
        if (!storefront[key]) continue;
        const { tree, unmatched } = withStoreContent(storefront[key], content);
        if (unmatched.length) console.log(`  ${key}: no copy for section(s) ${unmatched.join(", ")}`);
        if (!same(tree, storefront[key])) set[key] = tree;
      }
      if (Object.keys(set).length) {
        await write("storefronts", { id: storefront.id }, set, `storefront ${Object.keys(set).join(" and ")}`);
      }
    }

    for (const [slug, product] of Object.entries(content.products)) {
      const stored = await db.collection("store_products").findOne({ storeId: store.id, slug });
      if (!stored) continue;
      const { textLabel, ...fields } = productFieldsFor(product);
      const set = { ...fields, "shopperCustomization.textLabel": textLabel };
      const current = {
        name: stored.name,
        description: stored.description,
        tags: stored.tags,
        translations: stored.translations ?? {},
        "shopperCustomization.textLabel": stored.shopperCustomization?.textLabel,
      };
      if (!same(current, set)) await write("store_products", { id: stored.id }, { ...set, updatedAt: now }, `product ${slug}`);
    }

    for (const [slug, gift] of Object.entries(content.gifts)) {
      const stored = await db.collection("gift_catalogues").findOne({ storeId: store.id, slug });
      if (!stored) continue;
      const set = { intro: gift.intro, translations: storedTranslations(gift.i18n) };
      if (!same({ intro: stored.intro, translations: stored.translations ?? {} }, set)) {
        await write("gift_catalogues", { id: stored.id }, { ...set, updatedAt: now }, `gift portal ${slug}`);
      }
    }
  }
  console.log(`${writes} record(s) ${dryRun ? "to update" : "updated"}`);
} finally {
  await client.close();
}

/**
 * Makes every store product identifiable inside its store.
 *
 * 1. Gives it a store-level SKU. Products imported before SKUs existed carry
 *    none, which is how a store ended up with two rows called "Organic Cotton
 *    Tee" that nothing could tell apart. The rule matches src/lib/sku.ts:
 *    `<CHANNEL>-<STEM>`, then `-2`, `-3`… for later copies, oldest import first.
 * 2. Breaks duplicate slugs. Two copies made in the same second got the same
 *    slug, and a storefront URL can only resolve to one of them. The oldest
 *    keeps the slug it was published under; later copies are suffixed.
 *
 * Records already in good shape are left alone, so this is safe to re-run.
 *
 * Run: node --env-file=.env.local scripts/backfill-product-identity.mjs
 */
const KEY = process.env.CLAWCORP_API_KEY;
if (!KEY) {
  console.error("CLAWCORP_API_KEY missing");
  process.exit(1);
}
const BASE = "https://www.clawcorp.ai/api/platform";

async function dbCall(body) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`${BASE}/db`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return (await res.json()).result;
    if (attempt === 4) throw new Error(`${body.action} ${body.collection}: ${res.status} ${await res.text()}`);
    await new Promise((r) => setTimeout(r, 800 * attempt));
  }
}

function skuFor(channelCode, name, taken) {
  const prefix = channelCode.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 6) || "STORE";
  const stem =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(" ")
      .slice(0, 3)
      .map((word) => word.slice(0, 3).toUpperCase())
      .join("-") || "ITEM";
  const base = `${prefix}-${stem}`;
  let sku = base;
  for (let n = 2; taken.has(sku); n++) sku = `${base}-${n}`;
  taken.add(sku);
  return sku;
}

const stores = await dbCall({ collection: "stores", action: "find", filter: {} });
const products = await dbCall({ collection: "store_products", action: "find", filter: {} });
if (products.length === 100) {
  console.warn("100 products returned — the API caps a list there. Re-run until nothing is left to assign.");
}

let assigned = 0;
let renumbered = 0;
for (const store of stores) {
  const mine = products
    .filter((p) => p.storeId === store.id)
    .sort((a, b) => String(a.importedAt).localeCompare(String(b.importedAt)));
  const takenSkus = new Set(mine.filter((p) => p.sku).map((p) => p.sku));
  const takenSlugs = new Set();

  for (const product of mine) {
    const patch = {};

    if (!product.sku) {
      patch.sku = skuFor(store.channelCode, product.name, takenSkus);
      assigned += 1;
    }

    if (takenSlugs.has(product.slug)) {
      let slug = product.slug;
      for (let n = 2; takenSlugs.has(slug); n++) slug = `${product.slug}-${n}`;
      patch.slug = slug;
      renumbered += 1;
    }
    takenSlugs.add(patch.slug ?? product.slug);

    if (Object.keys(patch).length === 0) continue;
    await dbCall({
      collection: "store_products",
      action: "updateOne",
      filter: { id: product.id },
      update: { $set: patch },
    });
    console.log(`${store.name}: ${product.name} -> ${JSON.stringify(patch)}`);
  }
}

console.log(`done — ${assigned} SKU${assigned === 1 ? "" : "s"} assigned, ${renumbered} slug${renumbered === 1 ? "" : "s"} de-duplicated`);

/**
 * Removes leftovers from hands-on testing that the demo tenancy should not show:
 *
 *   - the throwaway "Test" store (client "Wundercode"), which sat next to the
 *     three real demo stores in the agency dashboard, the platform store list
 *     and the store switcher, and everything filed under it;
 *   - the second "Organic Cotton Tee" in the Northwind catalog, the copy whose
 *     SKU carries the `-2` suffix, which the AI assistant's product dropdowns
 *     showed as a near-identical row next to the original.
 *
 * Safe to run more than once: it deletes by identity and reports what it found,
 * so a workspace that is already clean is a no-op. A full `scripts/seed.mjs`
 * run clears every collection first and never writes either record, so this is
 * only for a workspace that has been used since it was seeded.
 *
 * Run: node --env-file=.env.local scripts/cleanup-demo-debris.mjs
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

const find = (collection, filter) => dbCall({ collection, action: "find", filter });
const deleteMany = (collection, filter) => dbCall({ collection, action: "deleteMany", filter });

/** Collections that file a record under the store it belongs to. */
const STORE_SCOPED = [
  "memberships",
  "store_products",
  "orders",
  "storefronts",
  "audit_logs",
  "ai_suggestions",
  "carts",
  "gift_catalogues",
  "gift_campaigns",
];

/** The demo stores the workspace is seeded with; anything else is debris. */
const SEEDED_STORES = new Set(["str_northwind", "str_lumen", "str_ferro", "str_halcyon", "str_rivet"]);

async function removeTestStores() {
  const stores = await find("stores", {});
  const debris = stores.filter(
    (store) => !SEEDED_STORES.has(store.id) && (store.name === "Test" || store.clientName === "Wundercode"),
  );
  if (debris.length === 0) {
    console.log("stores: no throwaway test store found");
    return;
  }
  for (const store of debris) {
    for (const collection of STORE_SCOPED) await deleteMany(collection, { storeId: store.id });
    await deleteMany("stores", { id: store.id });
    console.log(`stores: removed “${store.name}” (${store.clientName || "no client"}, ${store.id}) and its records`);
  }
}

async function removeDuplicateProducts() {
  // The copy flow suffixes the SKU of a second import of the same catalog
  // product, so the duplicate is the one carrying the suffix.
  const products = await find("store_products", { sku: "NORTHW-ORG-COT-TEE-2" });
  if (products.length === 0) {
    console.log("store_products: no duplicate Organic Cotton Tee found");
    return;
  }
  for (const product of products) {
    await deleteMany("ai_suggestions", { productId: product.id });
    await deleteMany("store_products", { id: product.id });
    console.log(`store_products: removed duplicate “${product.name}” (${product.sku}, ${product.id})`);
  }
}

await removeTestStores();
await removeDuplicateProducts();
console.log("cleanup-demo-debris ok");

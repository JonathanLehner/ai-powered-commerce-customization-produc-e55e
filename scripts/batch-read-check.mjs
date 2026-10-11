// Self-check for batched reads: npm run batch-read-check
//
// The dashboard loads every store's orders and products in one `$in` query each
// instead of a pair of reads per store. A batched read that dropped rows would
// under-report sales and order counts and look like a data-loss bug rather than
// a slow page, so this writes a known dataset into the development database and
// asserts that every read returns exactly the documents that match, in order.
//
// It needs MONGODB_URI and MONGODB_DB from `.env.local`, and refuses to run
// against production.
import assert from "node:assert/strict";
import { PRODUCTION_DB } from "./mongo.mjs";

if (!process.env.MONGODB_DB || process.env.MONGODB_DB === PRODUCTION_DB) {
  console.error("batch-read-check writes test data: set MONGODB_DB to the development database (see .env.local).");
  process.exit(1);
}

const { db } = await import("../src/lib/mongo.ts");
const { listOrdersByStore, listStoreProductsByStore } = await import("../src/lib/data.ts");

// Every id carries this run's prefix, so concurrent or aborted runs never collide.
const RUN = `chk${Date.now().toString(36)}`;
const store = (name) => `${RUN}_${name}`;

function order(storeId, index) {
  return {
    id: `ord_${storeId}_${String(index).padStart(4, "0")}`,
    code: `${storeId}-${index}`,
    storeId,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
  };
}

function ids(rows) {
  return [...rows.map((row) => row.id)].sort();
}

try {
  const storeIds = ["a", "b", "c", "d"].map(store);
  // Past the old platform API's 100-document ceiling, which a `$in` read used to stop at.
  const orders = storeIds.flatMap((storeId) => Array.from({ length: 60 }, (_, i) => order(storeId, i + 1)));
  const big = Array.from({ length: 237 }, (_, i) => order(store("big"), i + 1));
  await db.insertMany("orders", [...orders, ...big]);

  /* ------------------------------------- one read returns every match, once */

  const rows = await db.findIn("orders", "storeId", storeIds);
  assert.equal(rows.length, 240, "every order is returned, not the first hundred");
  assert.deepEqual(ids(rows), ids(orders));
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length, "no document twice");
  assert.ok(rows.every((row) => !("_id" in row)), "Mongo's _id never leaves the data layer");

  const single = await db.findIn("orders", "storeId", [store("big")]);
  assert.equal(single.length, 237);

  /* -------------------------- a store with no records is still asked for */

  const sparse = await db.findIn("orders", "storeId", [storeIds[0], store("empty")]);
  assert.equal(sparse.length, 60);

  /* ---------------------------------------------- nothing asked for, nothing read */

  assert.deepEqual(await db.findIn("orders", "storeId", []), []);
  assert.deepEqual(await db.findIn("orders", "storeId", ["", ""]), []);

  /* -------------------- sort, limit and skip are applied by the database */

  const page = await db.find("orders", { storeId: store("big") }, { sort: { createdAt: -1 }, skip: 10, limit: 5 });
  assert.deepEqual(
    page.map((o) => o.id),
    [227, 226, 225, 224, 223].map((i) => order(store("big"), i).id),
  );
  assert.equal(await db.count("orders", { storeId: store("big") }), 237);

  /* ---------------------- grouping keeps each store's own order, newest first */

  const byStore = await listOrdersByStore([storeIds[0], storeIds[1], store("none")]);
  assert.equal(byStore.get(storeIds[0]).length, 60);
  assert.equal(byStore.get(storeIds[0])[0].id, order(storeIds[0], 60).id, "newest first, as listOrders returns them");
  assert.equal(byStore.get(storeIds[0])[59].id, order(storeIds[0], 1).id);
  assert.deepEqual(byStore.get(store("none")), [], "a store with no orders reads as empty, not missing");

  await db.insertMany("store_products", [
    { id: `${RUN}_prd_1`, storeId: storeIds[0], updatedAt: "2026-02-01T00:00:00.000Z" },
    { id: `${RUN}_prd_2`, storeId: storeIds[0], updatedAt: "2026-03-01T00:00:00.000Z" },
  ]);
  const products = await listStoreProductsByStore([storeIds[0]]);
  assert.deepEqual(products.get(storeIds[0]).map((p) => p.id), [`${RUN}_prd_2`, `${RUN}_prd_1`]);
} finally {
  const mine = { id: { $regex: `^(ord_)?${RUN}_` } };
  await db.deleteMany("orders", mine);
  await db.deleteMany("store_products", mine);
}

console.log("batch-read-check: ok");
process.exit(0);

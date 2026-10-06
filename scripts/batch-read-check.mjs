// Self-check for batched reads: npm run batch-read-check
//
// The dashboard loads every store's orders and products in one query each
// instead of a pair of round trips per store. The platform API answers a `find`
// with at most 100 documents and applies no skip, so the batched read has to
// notice a truncated page and go back for the rest — a batch that quietly
// stopped at 100 would under-report sales and order counts and look like a
// data-loss bug rather than a slow page.
//
// The platform API is replaced here by a fake holding a known dataset, so every
// assertion is "the batched read returned exactly the documents that match".
import assert from "node:assert/strict";

process.env.CLAWCORP_API_KEY = process.env.CLAWCORP_API_KEY ?? "batch-read-check";

/** Documents the real endpoint returns from one `find`, however many match. */
const FIND_CAP = 100;

let dataset = [];
let calls = [];

/** The subset of Mongo filters `findIn` builds: equality, `$in`, `$nin`, `$and`. */
function matches(doc, filter) {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === "$and") return condition.every((part) => matches(doc, part));
    if (condition && typeof condition === "object") {
      if ("$in" in condition && !condition.$in.includes(doc[key])) return false;
      if ("$nin" in condition && condition.$nin.includes(doc[key])) return false;
      return true;
    }
    return doc[key] === condition;
  });
}

globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  assert.equal(body.action, "find", "the check only fakes reads");
  calls.push(body);
  const rows = dataset.filter((doc) => doc.collection === body.collection && matches(doc, body.filter));
  return new Response(JSON.stringify({ result: rows.slice(0, FIND_CAP) }), {
    headers: { "content-type": "application/json" },
  });
};

const { db } = await import("../src/lib/platform.ts");

function order(storeId, index) {
  return {
    collection: "orders",
    id: `ord_${storeId}_${String(index).padStart(4, "0")}`,
    storeId,
    createdAt: new Date(Date.UTC(2026, 0, 1 + (index % 28))).toISOString(),
  };
}

function load(docs) {
  dataset = docs;
  calls = [];
}

function ids(rows) {
  return [...rows.map((row) => row.id)].sort();
}

function expected(storeIds) {
  return ids(dataset.filter((doc) => storeIds.includes(doc.storeId)));
}

/* --------------------------------------- one read stands in for one per store */

{
  const storeIds = ["str_a", "str_b", "str_c"];
  load(storeIds.flatMap((storeId) => [1, 2, 3].map((i) => order(storeId, i))));
  const rows = await db.findIn("orders", "storeId", storeIds);
  assert.deepEqual(ids(rows), expected(storeIds));
  assert.equal(calls.length, 1, "three stores are one read, not three");
  assert.deepEqual(calls[0].filter, { storeId: { $in: storeIds } });
}

/* ----------------------------------- a store with no records is still asked for */

{
  load([order("str_a", 1)]);
  const rows = await db.findIn("orders", "storeId", ["str_a", "str_empty"]);
  assert.deepEqual(ids(rows), ["ord_str_a_0001"]);
}

/* ------------------------------------------------- nothing asked for, no read */

{
  load([order("str_a", 1)]);
  assert.deepEqual(await db.findIn("orders", "storeId", []), []);
  assert.deepEqual(await db.findIn("orders", "storeId", ["", ""]), []);
  assert.equal(calls.length, 0, "an empty id list must not reach the API");
}

/* --------------- a batch that fills the cap is split, and nothing is dropped */

{
  // Four stores, 60 orders each: every read covering more than one store comes
  // back truncated, so the batch has to halve until each read fits.
  const storeIds = ["str_a", "str_b", "str_c", "str_d"];
  load(storeIds.flatMap((storeId) => Array.from({ length: 60 }, (_, i) => order(storeId, i + 1))));
  const rows = await db.findIn("orders", "storeId", storeIds);
  assert.equal(rows.length, 240, "every order is returned, not the first hundred");
  assert.deepEqual(ids(rows), expected(storeIds));
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length, "no document twice");
  assert.ok(calls.length > 1, "a truncated read has to be followed by more");
}

/* ----------- a single store past the cap is paged with what is already in hand */

{
  load(Array.from({ length: 237 }, (_, i) => order("str_big", i + 1)));
  const rows = await db.findIn("orders", "storeId", ["str_big"]);
  assert.deepEqual(ids(rows), expected(["str_big"]));
  assert.equal(rows.length, 237);
  assert.ok(
    calls.slice(1).every((call) => "$and" in call.filter),
    "the follow-up reads exclude the documents already read",
  );
}

/* ------------------------------- a long id list is split into several batches */

{
  const storeIds = Array.from({ length: 60 }, (_, i) => `str_${i}`);
  load(storeIds.map((storeId) => order(storeId, 1)));
  const rows = await db.findIn("orders", "storeId", storeIds);
  assert.deepEqual(ids(rows), expected(storeIds));
  assert.equal(calls.length, 3, "sixty ids are read twenty-five at a time");
}

/* ----------------------------- grouping keeps each store's own order, newest first */

{
  const { listOrdersByStore, listStoreProductsByStore } = await import("../src/lib/data.ts");
  load([order("str_a", 3), order("str_a", 1), order("str_b", 2)]);
  const byStore = await listOrdersByStore(["str_a", "str_b", "str_none"]);
  assert.deepEqual(
    byStore.get("str_a").map((o) => o.id),
    ["ord_str_a_0003", "ord_str_a_0001"],
    "newest first, as listOrders returns them",
  );
  assert.deepEqual(byStore.get("str_b").map((o) => o.id), ["ord_str_b_0002"]);
  assert.deepEqual(byStore.get("str_none"), [], "a store with no orders reads as empty, not missing");

  load([
    { collection: "store_products", id: "prd_1", storeId: "str_a", updatedAt: "2026-02-01T00:00:00.000Z" },
    { collection: "store_products", id: "prd_2", storeId: "str_a", updatedAt: "2026-03-01T00:00:00.000Z" },
  ]);
  const products = await listStoreProductsByStore(["str_a"]);
  assert.deepEqual(products.get("str_a").map((p) => p.id), ["prd_2", "prd_1"]);
}

console.log("batch-read-check: ok");

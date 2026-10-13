// Self-check for the store figures added up in MongoDB: npm run metrics-check
//
// The dashboard, the store overview and the Orders page count orders, sales,
// refunds, attention reasons and best sellers in aggregations rather than by
// reading every order. This runs those pipelines over every store in the
// database and asserts they agree with `storeMetrics`, the JavaScript
// definition, figure for figure. It only reads.
import assert from "node:assert/strict";
import { openDatabase } from "./mongo.mjs";
import {
  orderMetricsPipeline,
  productCountsPipeline,
  shapeOrderMetrics,
  storeMetrics,
  topProductsPipeline,
} from "../src/lib/metrics.ts";

const { client, db } = await openDatabase();
try {
  const stores = await db.collection("stores").find({}, { projection: { _id: 0, id: 1, defaultCurrency: 1 } }).toArray();
  const ids = stores.map((store) => store.id);
  const orderRows = new Map((await db.collection("orders").aggregate(orderMetricsPipeline(ids)).toArray()).map((r) => [r._id, r]));
  const productRows = new Map((await db.collection("store_products").aggregate(productCountsPipeline(ids)).toArray()).map((r) => [r._id, r]));
  let orders = 0;
  for (const store of stores) {
    const storeOrders = await db.collection("orders").find({ storeId: store.id }, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
    const products = await db.collection("store_products").find({ storeId: store.id }, { projection: { _id: 0 } }).toArray();
    const expected = storeMetrics(storeOrders, products, store.defaultCurrency);
    const { topProducts, publishedProducts, draftProducts, currency, ...fromOrders } = expected;
    assert.deepEqual(shapeOrderMetrics(orderRows.get(store.id)), fromOrders, `order figures of ${store.id}`);
    const counts = productRows.get(store.id) ?? { publishedProducts: 0, draftProducts: 0 };
    assert.deepEqual([counts.publishedProducts, counts.draftProducts], [publishedProducts, draftProducts], `product counts of ${store.id}`);
    const top = await db.collection("orders").aggregate(topProductsPipeline(store.id)).toArray();
    assert.deepEqual(top, topProducts, `best sellers of ${store.id}`);
    assert.equal(currency, store.defaultCurrency);
    orders += storeOrders.length;
  }
  assert.deepEqual(shapeOrderMetrics(undefined).attention, { exception: 0, manual_routing: 0, awaiting_production: 0, total: 0 });
  console.log(`metrics-check: ${stores.length} stores and ${orders} orders agree with storeMetrics`);
} finally {
  await client.close();
}

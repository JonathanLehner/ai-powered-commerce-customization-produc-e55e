import "server-only";
import { COLLECTIONS } from "./data";
import {
  orderMetricsPipeline,
  productCountsPipeline,
  shapeOrderMetrics,
  topProductsPipeline,
  type OrderMetrics,
  type OrderMetricsRow,
  type StoreMetrics,
} from "./metrics";
import { db } from "./mongo";
import type { Store } from "./types";

/**
 * Store figures added up in MongoDB. The pages used to read every order and
 * every product of every store into the Worker to count them in JavaScript,
 * which grew with the order history on each view of the dashboard.
 */

/** The order figures of each store, in one read; a store without orders has zeros. */
export async function loadOrderMetrics(storeIds: string[]): Promise<Map<string, OrderMetrics>> {
  const rows = storeIds.length
    ? await db.aggregate<OrderMetricsRow>(COLLECTIONS.orders, orderMetricsPipeline(storeIds))
    : [];
  const byStore = new Map(rows.map((row) => [row._id, row]));
  return new Map(storeIds.map((id) => [id, shapeOrderMetrics(byStore.get(id))]));
}

/** Published and draft product counts of each store, in one read. */
export async function loadProductCounts(
  storeIds: string[],
): Promise<Map<string, Pick<StoreMetrics, "publishedProducts" | "draftProducts">>> {
  const rows = storeIds.length
    ? await db.aggregate<{ _id: string; publishedProducts: number; draftProducts: number }>(
        COLLECTIONS.storeProducts,
        productCountsPipeline(storeIds),
      )
    : [];
  const byStore = new Map(rows.map((row) => [row._id, row]));
  return new Map(
    storeIds.map((id) => [
      id,
      { publishedProducts: byStore.get(id)?.publishedProducts ?? 0, draftProducts: byStore.get(id)?.draftProducts ?? 0 },
    ]),
  );
}

/**
 * `storeMetrics` for each store, from two aggregations. Best sellers are left
 * empty: the pages that list stores side by side do not show them.
 */
export async function loadStoreMetrics(
  stores: Pick<Store, "id" | "defaultCurrency">[],
): Promise<Map<string, StoreMetrics>> {
  const ids = stores.map((store) => store.id);
  const [orders, products] = await Promise.all([loadOrderMetrics(ids), loadProductCounts(ids)]);
  return new Map(
    stores.map((store) => [
      store.id,
      {
        ...orders.get(store.id)!,
        ...products.get(store.id)!,
        currency: store.defaultCurrency,
        topProducts: [],
      },
    ]),
  );
}

/** The store's five best sellers by revenue. */
export function loadTopProducts(storeId: string): Promise<StoreMetrics["topProducts"]> {
  return db.aggregate<StoreMetrics["topProducts"][number]>(COLLECTIONS.orders, topProductsPipeline(storeId));
}

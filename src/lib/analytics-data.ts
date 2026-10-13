import "server-only";
import {
  analyticsPipeline,
  dailySeriesPipeline,
  fillSeries,
  shapeReport,
  shapeSparklines,
  sparklinePipeline,
  type AnalyticsFacets,
  type AnalyticsRange,
} from "./analytics";
import { COLLECTIONS } from "./data";
import { db } from "./mongo";
import type { Store } from "./types";

type ReportStore = Pick<Store, "id" | "defaultCurrency" | "defaultLanguage">;

/** The Analytics page's figures for one store and range, added up in MongoDB. */
export async function loadStoreAnalytics(store: ReportStore, range: AnalyticsRange) {
  const [facets] = await db.aggregate<AnalyticsFacets>(COLLECTIONS.orders, analyticsPipeline(store, range));
  return shapeReport(facets, range, store.defaultCurrency);
}

/** Every day of the range, for the CSV download. */
export async function loadDailySeries(store: ReportStore, range: AnalyticsRange) {
  const rows = await db.aggregate<Parameters<typeof fillSeries>[0][number]>(
    COLLECTIONS.orders,
    dailySeriesPipeline(store, range),
  );
  return fillSeries(rows, range, 1);
}

/** Daily net revenue per store over the range, for the dashboard cards. One read for every store. */
export async function loadSparklines(stores: Pick<Store, "id" | "defaultCurrency">[], range: AnalyticsRange) {
  if (stores.length === 0) return new Map<string, number[]>();
  const rows = await db.aggregate<Parameters<typeof shapeSparklines>[0][number]>(
    COLLECTIONS.orders,
    sparklinePipeline(stores, range),
  );
  return shapeSparklines(rows, stores.map((store) => store.id), range.days);
}

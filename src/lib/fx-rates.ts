import "server-only";
import { updateStore } from "./data";
import { fxStale, usesAutomaticRates, type FxSnapshot } from "./currency";
import type { Store } from "./types";
import { CURRENCY_OPTIONS } from "./util";

/**
 * The market rates behind automatic exchange rates, from the open exchange
 * rates feed at open.er-api.com (daily, no key). Kept on the store record
 * (`fxRates`) so pricing a page needs no extra read; refreshed when a store's
 * rates are a day old, and on demand from the settings page and the API.
 */

const FEED = "https://open.er-api.com/v6/latest/USD";

/** Today's rates for the supported currencies, or null when the feed cannot be reached. */
export async function fetchFxSnapshot(): Promise<FxSnapshot | null> {
  try {
    const response = await fetch(FEED, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return null;
    const body = (await response.json()) as { result?: string; rates?: Record<string, number> };
    if (body.result !== "success" || !body.rates) return null;
    const rates: Record<string, number> = {};
    for (const { code } of CURRENCY_OPTIONS) {
      const rate = body.rates[code];
      if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) rates[code] = rate;
    }
    return Object.keys(rates).length > 1 ? { base: "USD", rates, fetchedAt: new Date().toISOString() } : null;
  } catch {
    return null;
  }
}

/** Fetches and saves new market rates for the store. Returns the store as saved, unchanged if the feed was down. */
export async function refreshStoreFx(store: Store): Promise<Store> {
  const snapshot = await fetchFxSnapshot();
  if (!snapshot) return store;
  await updateStore(store.id, { fxRates: snapshot });
  return { ...store, fxRates: snapshot };
}

/** Refreshes the store's market rates when it prices by them and they are a day old. */
export async function refreshStoreFxIfStale(store: Store): Promise<Store> {
  if (store.currencies.length < 2 || !usesAutomaticRates(store) || !fxStale(store)) return store;
  return refreshStoreFx(store);
}

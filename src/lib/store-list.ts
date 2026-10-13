import type { Store } from "./types";

/**
 * The platform Overview's store table: a status filter (live stores by default)
 * and a search over store, client and agency names. Kept apart from the page so
 * the rules can be checked without a database: npm run store-list-check
 */

export const STORE_STATUS_FILTERS = ["active", "archived", "all"] as const;
export type StoreStatusFilter = (typeof STORE_STATUS_FILTERS)[number];

export interface StoreListParams {
  status?: string | string[];
  q?: string | string[];
}

export interface StoreListFilters {
  status: StoreStatusFilter;
  q: string;
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

export function parseStoreListFilters(params: StoreListParams): StoreListFilters {
  const status = first(params.status);
  return {
    status: (STORE_STATUS_FILTERS as readonly string[]).includes(status) ? (status as StoreStatusFilter) : "active",
    q: first(params.q).trim().slice(0, 100),
  };
}

/** The query string for a view, leaving out the defaults so the plain page stays `/admin`. */
export function storeListQuery(filters: StoreListFilters, change: Partial<StoreListFilters> = {}) {
  const next = { ...filters, ...change };
  const params = new URLSearchParams();
  if (next.status !== "active") params.set("status", next.status);
  if (next.q) params.set("q", next.q);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * The stores a view shows, live ones first and newest first within each status,
 * plus how many match the search under each status so the filter can show them.
 */
export function filterStoreList<S extends Pick<Store, "name" | "clientName" | "status" | "agencyId">>(
  stores: S[],
  filters: StoreListFilters,
  agencyName: (agencyId: string) => string | undefined,
) {
  const needle = filters.q.toLocaleLowerCase();
  const searched = needle
    ? stores.filter((store) =>
        [store.name, store.clientName, agencyName(store.agencyId) ?? ""].some((text) =>
          text.toLocaleLowerCase().includes(needle),
        ),
      )
    : stores;
  const active = searched.filter((store) => store.status === "active");
  const archived = searched.filter((store) => store.status !== "active");
  const rows = filters.status === "active" ? active : filters.status === "archived" ? archived : [...active, ...archived];
  return {
    rows,
    counts: { active: active.length, archived: archived.length, all: searched.length } satisfies Record<
      StoreStatusFilter,
      number
    >,
  };
}

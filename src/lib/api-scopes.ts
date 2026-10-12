/**
 * What an Admin API key may do: read, or read and write, per resource. Kept
 * free of server imports, so the key form, the API and the check script all
 * read the same list.
 */
export const API_RESOURCES = [
  "products",
  "collections",
  "orders",
  "customers",
  "discounts",
  "gift_cards",
  "reviews",
  "content",
  "storefront",
  "store",
  "gifting",
  "sourcing",
  "assistant",
  "team",
  "analytics",
  "activity",
  "agency",
] as const;

export type ApiResource = (typeof API_RESOURCES)[number];
export type ApiAccess = "read" | "write";
export type ApiScope = `${ApiResource}:${ApiAccess}`;

/** Areas the API only reports on. A key asked for write on one is given read. */
export const READ_ONLY_RESOURCES: readonly ApiResource[] = ["analytics", "activity"];

/**
 * Areas that reach past the store into the agency that owns it: its people,
 * its plan and its other stores. Only a key made by the agency's administrator
 * may hold one, and only while that person still is the administrator.
 */
export const AGENCY_RESOURCES: readonly ApiResource[] = ["agency"];

/**
 * The scope of a platform key: the platform administration screens (suppliers,
 * the supplier catalog, tax brackets, agencies, quotes, plan enquiries and the
 * platform audit log). Never part of a store key; only a platform administrator
 * creates a key that holds it.
 */
export const ADMIN_SCOPE = "platform:admin";
export type AdminScope = typeof ADMIN_SCOPE;

export function isApiScope(value: unknown): value is ApiScope {
  if (typeof value !== "string") return false;
  const [resource, access] = value.split(":");
  return (API_RESOURCES as readonly string[]).includes(resource) && (access === "read" || access === "write");
}

/** Whether `resource` offers write access at all. */
export function resourceWrites(resource: ApiResource): boolean {
  return !READ_ONLY_RESOURCES.includes(resource);
}

/**
 * The store scopes asked for, each once, in the order of `API_RESOURCES`. Write
 * includes read; a read-only area is given read. Agency areas are dropped
 * unless the person creating the key administers the agency. The admin scope
 * is never a store scope and is dropped too.
 */
export function normalizeScopes(values: unknown[], options: { agencyAdmin?: boolean } = {}): ApiScope[] {
  const wanted = new Set(values.filter(isApiScope));
  return API_RESOURCES.flatMap((resource): ApiScope[] => {
    if (AGENCY_RESOURCES.includes(resource) && !options.agencyAdmin) return [];
    const write = wanted.has(`${resource}:write`);
    if (write && resourceWrites(resource)) return [`${resource}:write`];
    return write || wanted.has(`${resource}:read`) ? [`${resource}:read`] : [];
  });
}

/** Whether a key holding `scopes` may `access` the resource. A write scope also reads. */
export function scopeAllows(scopes: readonly string[], resource: ApiResource, access: ApiAccess): boolean {
  return scopes.includes(`${resource}:write`) || (access === "read" && scopes.includes(`${resource}:read`));
}

/** The access a key holds on one resource, for the form and the key list. */
export function accessFor(scopes: readonly string[], resource: ApiResource): ApiAccess | null {
  if (scopes.includes(`${resource}:write`)) return "write";
  return scopes.includes(`${resource}:read`) ? "read" : null;
}

/** The prefix every secret starts with, so a leaked key is recognisable in logs and scanners. */
export const API_KEY_PREFIX = "plk_live_";

/** Requests a key may make per window before it is answered 429. */
export const API_RATE_LIMIT = 120;
export const API_RATE_WINDOW_SECONDS = 60;

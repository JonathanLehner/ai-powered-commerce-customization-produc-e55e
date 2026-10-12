/**
 * What an Admin API key may do: read, or read and write, per resource. Kept
 * free of server imports, so the key form, the API and the check script all
 * read the same list.
 */
export const API_RESOURCES = ["products", "collections", "orders", "customers", "discounts", "storefront", "store"] as const;

export type ApiResource = (typeof API_RESOURCES)[number];
export type ApiAccess = "read" | "write";
export type ApiScope = `${ApiResource}:${ApiAccess}`;

export function isApiScope(value: unknown): value is ApiScope {
  if (typeof value !== "string") return false;
  const [resource, access] = value.split(":");
  return (API_RESOURCES as readonly string[]).includes(resource) && (access === "read" || access === "write");
}

/** The scopes asked for, each once, in the order of `API_RESOURCES`. Write includes read. */
export function normalizeScopes(values: unknown[]): ApiScope[] {
  const wanted = new Set(values.filter(isApiScope));
  return API_RESOURCES.flatMap((resource): ApiScope[] =>
    wanted.has(`${resource}:write`) ? [`${resource}:write`] : wanted.has(`${resource}:read`) ? [`${resource}:read`] : [],
  );
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

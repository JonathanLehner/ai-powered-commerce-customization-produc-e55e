import "server-only";
import { API_KEY_PREFIX } from "../api-scopes";
import {
  PUBLISHABLE_KEY_PREFIX,
  SHOP_ANONYMOUS_RATE_LIMIT,
  consumeRateLimit,
  findApiKey,
  findPublishableKey,
  touchApiKey,
  type ApiKey,
  type RateLimitState,
} from "../api-keys";
import { getStore, getStoreBySlug, storefrontPaused } from "../data";
import type { OperationContext } from "../operations/context";
import type { Store } from "../types";
import type { AdminContext, ShopCallerInfo } from "./define";

/**
 * How the Admin REST API and the MCP server know who is calling. Both take a
 * store API key as `Authorization: Bearer <key>`, count the request against
 * the key's rate limit and run the store's operations under the key's name, so
 * every change lands in the store's audit history the same way whichever door
 * it came through. A platform key belongs to no store: it opens the platform
 * administration operations under `/api/v1/admin` and nothing else.
 */

export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "insufficient_scope"
  | "not_found"
  | "invalid_json"
  | "invalid_request"
  | "conflict"
  | "payment_failed"
  | "rate_limited"
  | "internal_error";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly field?: string;
  /** Extra fields for the error body, such as what blocks a publish. */
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: ApiErrorCode, message: string, field?: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.field = field;
    this.details = details;
  }
}

export function errorBody(error: Pick<ApiError, "code" | "message" | "field" | "details">) {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.field ? { field: error.field } : {}),
      ...(error.details ?? {}),
    },
  };
}

export function errorResponse(error: ApiError, headers: HeadersInit = {}): Response {
  return Response.json(errorBody(error), { status: error.status, headers });
}

export interface ApiCaller {
  key: ApiKey;
  /** The key's store; null for a platform key. */
  store: Store | null;
  /** Rate-limit and caching headers every answer to this request carries. */
  headers: Record<string, string>;
}

/** What a store operation is given when an API key runs it: the key, under its name, in English. */
export function keyContext(caller: ApiCaller): OperationContext {
  if (!caller.store) throw new ApiError(403, "forbidden", "This is a platform key. It works for the /admin operations only.");
  return { store: caller.store, actor: { id: caller.key.id, name: caller.key.name }, locale: "en" };
}

/** What a platform operation is given when a platform key runs it. */
export function adminContext(caller: ApiCaller): AdminContext {
  return { actor: { id: caller.key.id, name: caller.key.name }, locale: "en" };
}

function rateHeaders(rate: RateLimitState): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(rate.limit),
    "X-RateLimit-Remaining": String(rate.remaining),
    "X-RateLimit-Reset": String(rate.resetSeconds),
  };
}

/** The key in `Authorization: Bearer <key>`, or null. */
function bearer(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match ? match[1] : null;
}

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Reads and checks the key, then counts the request against its limit.
 * Answers with the error response when the request cannot go on.
 */
export async function authenticate(request: Request, realm: string): Promise<ApiCaller | Response> {
  const secret = bearer(request);
  if (secret?.startsWith(PUBLISHABLE_KEY_PREFIX)) {
    return errorResponse(
      new ApiError(401, "unauthorized", "This is a publishable key. It opens the Storefront API under /api/v1/shop only."),
      { ...NO_STORE, "WWW-Authenticate": `Bearer realm="${realm}", error="invalid_token"` },
    );
  }
  if (!secret) {
    return errorResponse(new ApiError(401, "unauthorized", "Send an API key as `Authorization: Bearer <key>`."), {
      ...NO_STORE,
      "WWW-Authenticate": `Bearer realm="${realm}"`,
    });
  }

  let key: ApiKey | null;
  let rate: RateLimitState;
  let store: Store | null;
  try {
    key = await findApiKey(secret);
    if (!key) {
      return errorResponse(new ApiError(401, "unauthorized", "This API key is not valid or has been revoked."), {
        ...NO_STORE,
        "WWW-Authenticate": `Bearer realm="${realm}", error="invalid_token"`,
      });
    }
    [rate, store] = await Promise.all([consumeRateLimit(key.id), key.storeId ? getStore(key.storeId) : null]);
  } catch (error) {
    console.error("API authentication failed", error);
    return errorResponse(new ApiError(500, "internal_error", "Something went wrong. Try again."), NO_STORE);
  }

  const headers = { ...NO_STORE, ...rateHeaders(rate) };
  if (!rate.allowed) {
    return errorResponse(
      new ApiError(429, "rate_limited", `Too many requests. Try again in ${rate.resetSeconds} seconds.`),
      { ...headers, "Retry-After": String(rate.resetSeconds) },
    );
  }
  if (key.storeId && !store) return errorResponse(new ApiError(404, "not_found", "Store not found."), headers);
  touchApiKey(key);
  return { key, store, headers };
}

/* --------------------------------------------------------- Storefront API */

/**
 * Every Storefront API answer may be read by a page on any site: the API is
 * public, and a publishable key is not a secret.
 */
export const SHOP_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Storefront-Key, X-Customer-Access-Token, Accept, Mcp-Protocol-Version",
  "Access-Control-Expose-Headers": "X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After",
  "Access-Control-Max-Age": "86400",
};

/** The answer to a browser's CORS preflight on any Storefront API address. */
export function shopPreflight(): Response {
  return new Response(null, { status: 204, headers: SHOP_CORS_HEADERS });
}

/** A Storefront API caller: the store it asked for, and who it is. */
export interface ShopCaller extends ShopCallerInfo {
  store: Store;
  /** The agency's trial is over: the store answers reads and refuses every change. */
  paused: boolean;
  /** Rate-limit, caching and CORS headers every answer to this request carries. */
  headers: Record<string, string>;
}

/** The client's address as the edge saw it. */
export function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

/** The store a Storefront API address names, by its slug or its id. Archived stores are not there. */
async function shopStore(handle: string): Promise<Store | null> {
  if (!handle) return null;
  const store = (await getStoreBySlug(handle)) ?? (await getStore(handle));
  return store && store.status === "active" ? store : null;
}

/**
 * Opens a Storefront API request for the store named `storeHandle`. A caller
 * with a publishable key (`X-Storefront-Key`, or `Authorization: Bearer`) is
 * counted against the key; anyone else against their IP address in this
 * store, at a lower limit. An Admin API key is refused here: it must never sit
 * where a shopper's browser could read it.
 */
export async function authenticateShop(request: Request, storeHandle: string): Promise<ShopCaller | Response> {
  const base = { ...NO_STORE, ...SHOP_CORS_HEADERS };
  const secret = request.headers.get("x-storefront-key")?.trim() || bearer(request);
  if (secret?.startsWith(API_KEY_PREFIX)) {
    return errorResponse(
      new ApiError(
        401,
        "unauthorized",
        "This is an Admin API key. The Storefront API takes a publishable key or none; never send an Admin key from a browser or a shopping agent.",
      ),
      base,
    );
  }

  let store: Store | null;
  let key: ApiKey | null = null;
  let rate: RateLimitState;
  let paused: boolean;
  const ip = clientIp(request);
  try {
    store = await shopStore(storeHandle);
    if (!store) return errorResponse(new ApiError(404, "not_found", "Store not found."), base);
    if (secret) {
      key = await findPublishableKey(secret);
      if (!key) {
        return errorResponse(new ApiError(401, "unauthorized", "This publishable key is not valid or has been revoked."), base);
      }
      if (key.storeId !== store.id) {
        return errorResponse(new ApiError(403, "forbidden", "This publishable key belongs to another store."), base);
      }
    }
    [rate, paused] = await Promise.all([
      key ? consumeRateLimit(key.id) : consumeRateLimit(`anon:${store.id}:${ip}`, Date.now(), SHOP_ANONYMOUS_RATE_LIMIT),
      storefrontPaused(store),
    ]);
  } catch (error) {
    console.error("Storefront API authentication failed", error);
    return errorResponse(new ApiError(500, "internal_error", "Something went wrong. Try again."), base);
  }

  const headers = { ...base, ...rateHeaders(rate) };
  if (!rate.allowed) {
    return errorResponse(
      new ApiError(
        429,
        "rate_limited",
        `Too many requests. Try again in ${rate.resetSeconds} seconds.${key ? "" : " A publishable key raises the limit."}`,
      ),
      { ...headers, "Retry-After": String(rate.resetSeconds) },
    );
  }
  if (key) touchApiKey(key);
  return { store, keyId: key?.id ?? null, ip, paused, headers };
}

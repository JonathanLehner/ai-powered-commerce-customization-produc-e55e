import "server-only";
import { consumeRateLimit, findApiKey, touchApiKey, type ApiKey, type RateLimitState } from "../api-keys";
import { getStore } from "../data";
import type { OperationContext } from "../operations/context";
import type { Store } from "../types";
import type { AdminContext } from "./define";

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

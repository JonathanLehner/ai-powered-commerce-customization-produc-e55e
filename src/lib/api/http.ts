import "server-only";
import type { NextRequest } from "next/server";
import { consumeRateLimit, findApiKey, touchApiKey, type ApiKey, type RateLimitState } from "../api-keys";
import { scopeAllows, type ApiAccess, type ApiResource } from "../api-scopes";
import { getStore, type RecordPage } from "../data";
import { isOperationError, type OperationContext, type OperationErrorCode } from "../operations/context";

/**
 * The Admin REST API's request pipeline. Every endpoint under
 * `/api/v1/stores/{storeId}/…` goes through `apiRoute`, which:
 *
 * 1. reads the key from `Authorization: Bearer <key>` and answers 401 without one;
 * 2. counts the request against the key's rate limit and answers 429 past it;
 * 3. answers 403 when the key belongs to another store or lacks the scope;
 * 4. runs the endpoint with an operation context naming the key as the actor,
 *    so every change lands in the store's audit history under the key's name.
 *
 * Errors always come back as `{ "error": { "code", "message" } }`.
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

  constructor(status: number, code: ApiErrorCode, message: string, field?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

const OPERATION_ERRORS: Record<OperationErrorCode, [number, ApiErrorCode]> = {
  invalid: [422, "invalid_request"],
  not_found: [404, "not_found"],
  conflict: [409, "conflict"],
  payment_failed: [402, "payment_failed"],
};

export function errorBody(code: ApiErrorCode, message: string, field?: string) {
  return { error: field ? { code, message, field } : { code, message } };
}

function errorResponse(error: ApiError, headers: HeadersInit = {}): Response {
  return Response.json(errorBody(error.code, error.message, error.field), { status: error.status, headers });
}

export interface ApiContext extends OperationContext {
  key: ApiKey;
  request: NextRequest;
}

type Params = Record<string, string>;

type Handler<P extends Params> = (ctx: ApiContext, params: P) => Promise<Response>;

function rateHeaders(rate: RateLimitState): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(rate.limit),
    "X-RateLimit-Remaining": String(rate.remaining),
    "X-RateLimit-Reset": String(rate.resetSeconds),
  };
}

/** The key in `Authorization: Bearer <key>`, or null. */
function bearer(request: NextRequest): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match ? match[1] : null;
}

/**
 * Wraps an endpoint. `scope` is the resource and the access it needs; a write
 * scope also reads.
 */
export function apiRoute<P extends Params & { storeId: string }>(
  scope: [ApiResource, ApiAccess],
  handler: Handler<P>,
): (request: NextRequest, context: { params: Promise<P> }) => Promise<Response> {
  return async (request, context) => {
    const noStore = { "Cache-Control": "no-store" };
    const secret = bearer(request);
    if (!secret) {
      return errorResponse(
        new ApiError(401, "unauthorized", "Send an API key as `Authorization: Bearer <key>`."),
        { ...noStore, "WWW-Authenticate": 'Bearer realm="Parcelith Admin API"' },
      );
    }

    let rate: RateLimitState;
    let key: ApiKey | null;
    try {
      key = await findApiKey(secret);
      if (!key) {
        return errorResponse(new ApiError(401, "unauthorized", "This API key is not valid or has been revoked."), {
          ...noStore,
          "WWW-Authenticate": 'Bearer realm="Parcelith Admin API", error="invalid_token"',
        });
      }
      rate = await consumeRateLimit(key.id);
    } catch (error) {
      console.error("API authentication failed", error);
      return errorResponse(new ApiError(500, "internal_error", "Something went wrong. Try again."), noStore);
    }

    const headers = { ...noStore, ...rateHeaders(rate) };
    if (!rate.allowed) {
      return errorResponse(
        new ApiError(429, "rate_limited", `Too many requests. Try again in ${rate.resetSeconds} seconds.`),
        { ...headers, "Retry-After": String(rate.resetSeconds) },
      );
    }
    touchApiKey(key);

    const params = await context.params;
    if (params.storeId !== key.storeId) {
      return errorResponse(new ApiError(403, "forbidden", "This API key belongs to another store."), headers);
    }
    const [resource, access] = scope;
    if (!scopeAllows(key.scopes, resource, access)) {
      return errorResponse(
        new ApiError(403, "insufficient_scope", `This API key needs the ${resource}:${access} scope.`),
        headers,
      );
    }

    try {
      const store = await getStore(key.storeId);
      if (!store) throw new ApiError(404, "not_found", "Store not found.");
      const response = await handler(
        { store, actor: { id: key.id, name: key.name }, locale: "en", key, request },
        params,
      );
      for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
      return response;
    } catch (error) {
      if (error instanceof ApiError) return errorResponse(error, headers);
      if (isOperationError(error)) {
        const [status, code] = OPERATION_ERRORS[error.code];
        return errorResponse(new ApiError(status, code, error.message, error.field), headers);
      }
      console.error(`API ${request.method} ${request.nextUrl.pathname} failed`, error);
      return errorResponse(new ApiError(500, "internal_error", "Something went wrong. Try again."), headers);
    }
  };
}

/* --------------------------------------------------------------- responses */

export function ok(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function notFound(what: string): never {
  throw new ApiError(404, "not_found", `${what} not found.`);
}

/* -------------------------------------------------------------- pagination */

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export interface PageQuery {
  limit: number;
  after: [string, string] | null;
}

/** `limit` and `cursor` off the query string. */
export function pageQuery(request: NextRequest): PageQuery {
  const params = request.nextUrl.searchParams;
  const rawLimit = params.get("limit");
  let limit = DEFAULT_PAGE_SIZE;
  if (rawLimit !== null) {
    limit = Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
      throw new ApiError(422, "invalid_request", `\`limit\` must be a whole number from 1 to ${MAX_PAGE_SIZE}.`, "limit");
    }
  }
  const cursor = params.get("cursor");
  return { limit, after: cursor ? decodeCursor(cursor) : null };
}

function decodeCursor(cursor: string): [string, string] {
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (Array.isArray(value) && value.length === 2 && value.every((part) => typeof part === "string")) {
      return value as [string, string];
    }
  } catch {
    // Reported below.
  }
  throw new ApiError(422, "invalid_request", "`cursor` is not one this API returned.", "cursor");
}

/** A page as the API returns it: `{ data, nextCursor }`. */
export function pageResponse<T, R>(page: RecordPage<T>, present: (row: T) => R): Response {
  return ok({
    data: page.data.map(present),
    nextCursor: page.next ? Buffer.from(JSON.stringify(page.next)).toString("base64url") : null,
  });
}

/* ------------------------------------------------------------------- input */

/** The JSON object in the request body. */
export async function readBody(request: NextRequest): Promise<Body> {
  let value: unknown;
  try {
    const text = await request.text();
    value = text.trim() === "" ? {} : JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_json", "The request body is not valid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "invalid_json", "The request body must be a JSON object.");
  }
  return new Body(value as Record<string, unknown>);
}

function invalid(field: string, message: string): never {
  throw new ApiError(422, "invalid_request", `\`${field}\` ${message}`, field);
}

/** Typed reads of a JSON body. Each returns undefined when the field is absent. */
export class Body {
  constructor(readonly value: Record<string, unknown>) {}

  has(field: string): boolean {
    return this.value[field] !== undefined;
  }

  string(field: string, options: { required?: boolean; nullable?: false; max?: number } = {}): string | undefined {
    const raw = this.value[field];
    if (raw === undefined || raw === null) {
      if (options.required) invalid(field, "is required.");
      if (raw === null) invalid(field, "must be a string.");
      return undefined;
    }
    if (typeof raw !== "string") invalid(field, "must be a string.");
    if (options.max !== undefined && raw.length > options.max) invalid(field, `must be ${options.max} characters or fewer.`);
    return raw;
  }

  /** A string or null; null is how a caller clears the field. */
  nullableString(field: string, options: { max?: number } = {}): string | null | undefined {
    if (this.value[field] === null) return null;
    return this.string(field, options);
  }

  integer(field: string, options: { required?: boolean; min?: number; max?: number } = {}): number | undefined {
    const raw = this.value[field];
    if (raw === undefined) {
      if (options.required) invalid(field, "is required.");
      return undefined;
    }
    if (typeof raw !== "number" || !Number.isInteger(raw)) invalid(field, "must be a whole number.");
    if (options.min !== undefined && raw < options.min) invalid(field, `must be at least ${options.min}.`);
    if (options.max !== undefined && raw > options.max) invalid(field, `must be at most ${options.max}.`);
    return raw;
  }

  nullableInteger(field: string, options: { min?: number } = {}): number | null | undefined {
    if (this.value[field] === null) return null;
    return this.integer(field, options);
  }

  boolean(field: string, options: { required?: boolean } = {}): boolean | undefined {
    const raw = this.value[field];
    if (raw === undefined) {
      if (options.required) invalid(field, "is required.");
      return undefined;
    }
    if (typeof raw !== "boolean") invalid(field, "must be true or false.");
    return raw;
  }

  oneOf<T extends string>(field: string, options: readonly T[], settings: { required?: boolean } = {}): T | undefined {
    const raw = this.string(field, settings);
    if (raw === undefined) return undefined;
    if (!options.includes(raw as T)) invalid(field, `must be one of ${options.join(", ")}.`);
    return raw as T;
  }

  strings(field: string, options: { required?: boolean; max?: number } = {}): string[] | undefined {
    const raw = this.value[field];
    if (raw === undefined) {
      if (options.required) invalid(field, "is required.");
      return undefined;
    }
    if (!Array.isArray(raw) || !raw.every((item) => typeof item === "string")) {
      invalid(field, "must be an array of strings.");
    }
    if (options.max !== undefined && raw.length > options.max) invalid(field, `must have ${options.max} items or fewer.`);
    return raw as string[];
  }

  /** An object of string values, such as a set of translations. */
  stringMap(field: string, options: { required?: boolean } = {}): Record<string, string> | undefined {
    const raw = this.value[field];
    if (raw === undefined) {
      if (options.required) invalid(field, "is required.");
      return undefined;
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || !Object.values(raw).every((v) => typeof v === "string")) {
      invalid(field, "must be an object of strings.");
    }
    return raw as Record<string, string>;
  }

  object(field: string): Body | undefined {
    const raw = this.value[field];
    if (raw === undefined) return undefined;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) invalid(field, "must be an object.");
    return new Body(raw as Record<string, unknown>);
  }

  /** Any JSON value, unchecked; the operation reading it checks it. */
  raw(field: string): unknown {
    return this.value[field];
  }
}

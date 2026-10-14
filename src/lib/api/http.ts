import "server-only";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { ADMIN_SCOPE, AGENCY_RESOURCES, STORE_ADMIN_RESOURCES, scopeAllows, type ApiAccess, type ApiResource } from "../api-scopes";
import { getAgency, getUserById, listMembershipsForUser } from "../data";
import { resolveStoreRole } from "../store-access";
import { billingPending } from "../trial";
import { shopperLocale, shopperTranslator } from "@/i18n/storefront";
import { OperationError, isOperationError, type OperationErrorCode } from "../operations/context";
import {
  ApiError,
  adminContext,
  authenticate,
  authenticateShop,
  errorResponse,
  keyContext,
  type ApiCaller,
  type ApiErrorCode,
  type ShopCaller,
} from "./auth";
import type { ShopContext } from "./define";
import { findOperation, pathParams, type ApiOperation } from "./operations";

/**
 * The Admin REST API's request pipeline. Every endpoint under
 * `/api/v1/stores/{storeId}/…` and `/api/v1/admin/…` is one entry of
 * `API_OPERATIONS`, served by `restHandler`, which:
 *
 * 1. reads the key from `Authorization: Bearer <key>` and answers 401 without one;
 * 2. counts the request against the key's rate limit and answers 429 past it;
 * 3. answers 403 when the key belongs to another store or lacks the scope (see
 *    `authorize`, which the MCP server runs too);
 * 4. checks the input against the operation's schema and answers 422 when it fails;
 * 5. runs the operation with the key named as the actor, so every change lands
 *    in the store's audit history under the key's name.
 *
 * Errors always come back as `{ "error": { "code", "message" } }`.
 */

export const API_REALM = "Parcelith Admin API";

const OPERATION_ERRORS: Record<OperationErrorCode, [number, ApiErrorCode]> = {
  invalid: [422, "invalid_request"],
  not_found: [404, "not_found"],
  conflict: [409, "conflict"],
  payment_failed: [402, "payment_failed"],
};

/** A store operation's refusal, or a bad input, as the API reports it; null for a fault. */
export function refusalOf(error: unknown): ApiError | null {
  if (error instanceof ApiError) return error;
  if (isOperationError(error)) {
    const [status, code] = OPERATION_ERRORS[error.code];
    return new ApiError(status, code, error.message, error.field);
  }
  if (error instanceof z.ZodError) {
    // Every problem at once, so a caller can fix them in one go.
    const issues = error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message }));
    const field = issues[0]?.field || undefined;
    const message = issues.map((issue) => (issue.field ? `\`${issue.field}\`: ${issue.message}` : issue.message)).join(" ");
    return new ApiError(422, "invalid_request", message || "Invalid input.", field, issues.length > 0 ? { issues } : undefined);
  }
  return null;
}

/** Whether a key holding `scopes` may run the operation, by its scopes alone. */
export function allows(scopes: readonly string[], operation: ApiOperation): boolean {
  if (operation.admin) return scopes.includes(ADMIN_SCOPE);
  const [resource, access] = operation.scope.split(":") as [ApiResource, ApiAccess];
  return scopeAllows(scopes, resource, access);
}

/**
 * Whether the caller may run the operation, or the refusal.
 *
 * - A platform operation needs a platform key whose maker is still a platform
 *   administrator. A store key never runs one, whatever it was given.
 * - A store operation needs a store key with the scope. An agency area also
 *   needs the key's maker to still administer the agency that owns the store,
 *   so a key cannot outlive the authority it was made with.
 */
export async function authorize(caller: ApiCaller, operation: ApiOperation): Promise<ApiError | null> {
  const { key } = caller;
  if (operation.shop) return new ApiError(404, "not_found", "Storefront API operations are served under /api/v1/shop/{storeHandle}.");
  if (operation.admin) {
    if (!key.platform || !key.scopes.includes(ADMIN_SCOPE)) {
      return new ApiError(403, "insufficient_scope", `This operation needs a platform key with the ${ADMIN_SCOPE} scope.`);
    }
    const maker = await getUserById(key.createdById);
    if (maker?.platformRole !== "platform_admin") {
      return new ApiError(403, "forbidden", "The person who made this key is no longer a platform administrator.");
    }
    return null;
  }

  if (!caller.store) return new ApiError(403, "forbidden", "This is a platform key. It works for the /admin operations only.");
  if (!allows(key.scopes, operation)) {
    return new ApiError(403, "insufficient_scope", `This API key needs the ${operation.scope} scope.`);
  }
  const [resource, access] = operation.scope.split(":") as [ApiResource, ApiAccess];
  if (access === "write" && billingPending(await getAgency(caller.store.agencyId))) {
    return new ApiError(403, "forbidden", "The agency's free trial has ended. Add payment details in Billing to make changes.");
  }
  if (AGENCY_RESOURCES.includes(resource)) {
    const maker = await getUserById(key.createdById);
    if (maker?.platformRole !== "agency_admin" || maker.agencyId !== caller.store.agencyId) {
      return new ApiError(403, "forbidden", "The person who made this key no longer administers the agency.");
    }
  }
  if (STORE_ADMIN_RESOURCES.includes(resource)) {
    const maker = await getUserById(key.createdById);
    const grant = maker ? resolveStoreRole(maker, caller.store, await listMembershipsForUser(maker.id)) : null;
    if (grant?.role !== "store_admin") {
      return new ApiError(403, "forbidden", `Only a store administrator can manage ${resource}. The person who made this key no longer administers the store.`);
    }
  }
  return null;
}

/** The JSON object in the request body; an empty body is an empty object. */
async function readBody(request: NextRequest): Promise<Record<string, unknown>> {
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
  return value as Record<string, unknown>;
}

/** Runs an operation's input through its schema, then the operation. */
export async function runOperation(operation: ApiOperation, ctx: Parameters<ApiOperation["run"]>[0], raw: unknown) {
  const input = operation.input.parse(raw);
  return operation.run(ctx, input as never);
}

/**
 * The route handler for one operation: `export const GET = restHandler("listProducts")`.
 * A store operation's route sits under `stores/[storeId]`, a platform
 * operation's under `admin`.
 */
export function restHandler(operationId: string) {
  const operation = findOperation(operationId);
  if (operation.shop) throw new Error(`${operationId} is a Storefront API operation: serve it with shopHandler.`);
  const named = pathParams(operation);

  return async (request: NextRequest, context: { params: Promise<Record<string, string>> }): Promise<Response> => {
    const caller = await authenticate(request, API_REALM);
    if (caller instanceof Response) return caller;
    const { headers } = caller;

    const params = await context.params;
    if (!operation.admin && caller.key.storeId && params.storeId !== caller.key.storeId) {
      return errorResponse(new ApiError(403, "forbidden", "This API key belongs to another store."), headers);
    }

    try {
      const denied = await authorize(caller, operation);
      if (denied) return errorResponse(denied, headers);
      const fields =
        operation.method === "GET" || operation.method === "DELETE"
          ? Object.fromEntries(request.nextUrl.searchParams)
          : await readBody(request);
      const input = { ...fields, ...Object.fromEntries(named.map((name) => [name, params[name]])) };
      const result = await runOperation(operation, operation.admin ? adminContext(caller) : keyContext(caller), input);
      return Response.json(result, { status: operation.status ?? 200, headers });
    } catch (error) {
      const refusal = refusalOf(error);
      if (refusal) return errorResponse(refusal, headers);
      console.error(`API ${request.method} ${request.nextUrl.pathname} failed`, error);
      return errorResponse(new ApiError(500, "internal_error", "Something went wrong. Try again."), headers);
    }
  };
}

/* --------------------------------------------------------- Storefront API */

export { shopPreflight } from "./auth";

/**
 * Whether a Storefront API caller may run the operation, or the refusal. Only
 * Storefront API operations run here, and a paused store refuses every change.
 */
export function authorizeShop(caller: ShopCaller, operation: ApiOperation): ApiError | null {
  if (!operation.shop) return new ApiError(404, "not_found", "No such Storefront API operation.");
  if (operation.scope === "shop:write" && caller.paused) {
    return new ApiError(409, "conflict", "This store is not taking orders at the moment. Its products can still be read.");
  }
  return null;
}

/**
 * The context a Storefront API operation runs in: the `locale` asked for when
 * the store offers it (else the store's default), and the `currency` asked for,
 * which the store must sell in (else its own).
 */
async function shopContext(caller: ShopCaller, input: Record<string, unknown>): Promise<ShopContext> {
  const { store } = caller;
  const locale = shopperLocale(store, typeof input.locale === "string" ? input.locale : "");
  const asked = typeof input.currency === "string" ? input.currency.toUpperCase() : null;
  if (asked && !store.currencies.includes(asked)) {
    const t = await shopperTranslator(store, locale);
    throw new OperationError("invalid", t("actions.currencyNotSold", { currency: asked }), "currency");
  }
  return { store, locale, currency: asked ?? store.defaultCurrency, caller: { keyId: caller.keyId, ip: caller.ip } };
}

/** Runs a Storefront API operation's input through its schema, then the operation, for REST and MCP alike. */
export async function runShopOperation(operation: ApiOperation, caller: ShopCaller, raw: unknown) {
  const input = operation.input.parse(raw) as Record<string, unknown>;
  return operation.run(await shopContext(caller, input), input as never);
}

/**
 * The route handler for one Storefront API operation, under
 * `shop/[storeHandle]`: `export const POST = shopHandler("createCart");`.
 * Public: a publishable key raises the rate limit but is not needed. A shopper
 * account token may come as `X-Customer-Access-Token` instead of an input, so
 * it stays out of addresses and logs.
 */
export function shopHandler(operationId: string) {
  const operation = findOperation(operationId);
  if (!operation.shop) throw new Error(`${operationId} is not a Storefront API operation: serve it with restHandler.`);
  const named = pathParams(operation);
  const takesCustomerToken = "customerAccessToken" in operation.input.shape;

  return async (request: NextRequest, context: { params: Promise<Record<string, string>> }): Promise<Response> => {
    const params = await context.params;
    const caller = await authenticateShop(request, params.storeHandle ?? "");
    if (caller instanceof Response) return caller;
    const { headers } = caller;

    try {
      const denied = authorizeShop(caller, operation);
      if (denied) return errorResponse(denied, headers);
      const fields =
        operation.method === "GET" || operation.method === "DELETE"
          ? Object.fromEntries(request.nextUrl.searchParams)
          : await readBody(request);
      const token = request.headers.get("x-customer-access-token");
      const input = {
        ...fields,
        ...(takesCustomerToken && token ? { customerAccessToken: token } : {}),
        ...Object.fromEntries(named.map((name) => [name, params[name]])),
      };
      const result = await runShopOperation(operation, caller, input);
      return Response.json(result, { status: operation.status ?? 200, headers });
    } catch (error) {
      const refusal = refusalOf(error);
      if (refusal) return errorResponse(refusal, headers);
      console.error(`Storefront API ${request.method} ${request.nextUrl.pathname} failed`, error);
      return errorResponse(new ApiError(500, "internal_error", "Something went wrong. Try again."), headers);
    }
  };
}

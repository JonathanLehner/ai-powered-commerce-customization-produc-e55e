import "server-only";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { ADMIN_SCOPE, AGENCY_RESOURCES, STORE_ADMIN_RESOURCES, scopeAllows, type ApiAccess, type ApiResource } from "../api-scopes";
import { getUserById, listMembershipsForUser } from "../data";
import { resolveStoreRole } from "../store-access";
import { isOperationError, type OperationErrorCode } from "../operations/context";
import { ApiError, adminContext, authenticate, errorResponse, keyContext, type ApiCaller, type ApiErrorCode } from "./auth";
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
    const issue = error.issues[0];
    const field = issue?.path.join(".") || undefined;
    return new ApiError(422, "invalid_request", field ? `\`${field}\`: ${issue.message}` : (issue?.message ?? "Invalid input."), field);
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
  const resource = operation.scope.split(":")[0] as ApiResource;
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

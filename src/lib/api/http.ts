import "server-only";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { scopeAllows, type ApiAccess, type ApiResource } from "../api-scopes";
import { isOperationError, type OperationErrorCode } from "../operations/context";
import { ApiError, authenticate, errorResponse, keyContext, type ApiErrorCode } from "./auth";
import { findOperation, pathParams, type ApiOperation } from "./operations";

/**
 * The Admin REST API's request pipeline. Every endpoint under
 * `/api/v1/stores/{storeId}/…` is one entry of `API_OPERATIONS`, served by
 * `restHandler`, which:
 *
 * 1. reads the key from `Authorization: Bearer <key>` and answers 401 without one;
 * 2. counts the request against the key's rate limit and answers 429 past it;
 * 3. answers 403 when the key belongs to another store or lacks the scope;
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

/** Whether a key holding `scopes` may run the operation. */
export function allows(scopes: readonly string[], operation: ApiOperation): boolean {
  const [resource, access] = operation.scope.split(":") as [ApiResource, ApiAccess];
  return scopeAllows(scopes, resource, access);
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

/** The route handler for one operation: `export const GET = restHandler("listProducts")`. */
export function restHandler(operationId: string) {
  const operation = findOperation(operationId);
  const named = pathParams(operation);

  return async (request: NextRequest, context: { params: Promise<Record<string, string>> }): Promise<Response> => {
    const caller = await authenticate(request, API_REALM);
    if (caller instanceof Response) return caller;
    const { headers } = caller;

    const params = await context.params;
    if (params.storeId !== caller.key.storeId) {
      return errorResponse(new ApiError(403, "forbidden", "This API key belongs to another store."), headers);
    }
    if (!allows(caller.key.scopes, operation)) {
      return errorResponse(
        new ApiError(403, "insufficient_scope", `This API key needs the ${operation.scope} scope.`),
        headers,
      );
    }

    try {
      const fields =
        operation.method === "GET" || operation.method === "DELETE"
          ? Object.fromEntries(request.nextUrl.searchParams)
          : await readBody(request);
      const input = { ...fields, ...Object.fromEntries(named.map((name) => [name, params[name]])) };
      const result = await runOperation(operation, keyContext(caller), input);
      return Response.json(result, { status: operation.status ?? 200, headers });
    } catch (error) {
      const refusal = refusalOf(error);
      if (refusal) return errorResponse(refusal, headers);
      console.error(`API ${request.method} ${request.nextUrl.pathname} failed`, error);
      return errorResponse(new ApiError(500, "internal_error", "Something went wrong. Try again."), headers);
    }
  };
}

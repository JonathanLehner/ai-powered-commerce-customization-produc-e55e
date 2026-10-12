import { ApiError, errorResponse } from "@/lib/api/auth";

/** An address under the API that no endpoint answers: the API's own error body rather than the site's 404 page. */
function missing(): Response {
  return errorResponse(new ApiError(404, "not_found", "No such endpoint. See /api/v1/openapi.json."), { "Cache-Control": "no-store" });
}

export const GET = missing;
export const POST = missing;
export const PUT = missing;
export const PATCH = missing;
export const DELETE = missing;

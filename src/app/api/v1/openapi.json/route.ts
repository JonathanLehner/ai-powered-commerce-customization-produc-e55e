import { openApiDocument } from "@/lib/api/openapi";

/** The Admin API's OpenAPI document. The same for everyone, so it is written at build time. */
export const dynamic = "force-static";

export function GET(): Response {
  return Response.json(openApiDocument());
}

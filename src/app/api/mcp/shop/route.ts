import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { SHOP_CORS_HEADERS, authenticateShop, shopPreflight } from "@/lib/api/auth";
import { shopMcpServer } from "@/lib/mcp/server";

/**
 * The shop MCP server for shopping agents, over Streamable HTTP. The store is
 * named by the `store` query parameter (`/api/mcp/shop?store=<slug or id>`) or
 * the `X-Store` header. Public like the Storefront API: anonymous callers are
 * rate-limited per IP address and store, and a publishable key
 * (`X-Storefront-Key` or `Authorization: Bearer`) raises the limit. Stateless:
 * each POST gets its own server and transport and a JSON answer.
 */

export async function POST(request: Request): Promise<Response> {
  const handle = new URL(request.url).searchParams.get("store") ?? request.headers.get("x-store") ?? "";
  const caller = await authenticateShop(request, handle.trim());
  if (caller instanceof Response) return caller;

  const server = shopMcpServer(caller);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(request);
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(caller.headers)) headers.set(name, value);
    return new Response(await response.arrayBuffer(), { status: response.status, headers });
  } finally {
    await server.close();
  }
}

/** No server-sent stream and no sessions to end: every call is a POST. */
function notAllowed(): Response {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null },
    { status: 405, headers: { ...SHOP_CORS_HEADERS, Allow: "POST, OPTIONS" } },
  );
}

export const GET = notAllowed;
export const DELETE = notAllowed;
export const OPTIONS = shopPreflight;

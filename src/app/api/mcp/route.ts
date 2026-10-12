import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticate } from "@/lib/api/auth";
import { storeMcpServer } from "@/lib/mcp/server";

/**
 * The MCP server, over Streamable HTTP. Authenticated with a store API key as
 * `Authorization: Bearer <key>`, rate-limited per request like the REST API.
 * Stateless: each POST gets its own server and transport and a JSON answer,
 * so it runs the same on Workers as on Node and nothing outlives the request.
 */

const REALM = "Parcelith MCP";

export async function POST(request: Request): Promise<Response> {
  const caller = await authenticate(request, REALM);
  if (caller instanceof Response) return caller;

  const server = storeMcpServer(caller);
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
    { status: 405, headers: { Allow: "POST" } },
  );
}

export const GET = notAllowed;
export const DELETE = notAllowed;

import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { scopeAllows } from "../api-scopes";
import { ApiError, adminContext, keyContext, type ApiCaller } from "../api/auth";
import type { ApiOperation } from "../api/define";
import { authorize, refusalOf, runOperation } from "../api/http";
import { openApiDocument } from "../api/openapi";
import { API_OPERATIONS, toolName } from "../api/operations";
import { presentStore } from "../api/present";
import { COLLECTIONS } from "../data";
import { db } from "../mongo";

/**
 * The MCP server an API key opens. A store key is offered one tool per store
 * operation of the Admin API, a platform key one per platform operation; each
 * runs through the same schema, the same checks and the same operations as its
 * REST endpoint. Read-only resources: the store summary (store keys) and the
 * OpenAPI document. A new server is made per request: the transport is
 * stateless, so nothing is held between calls.
 */

export const STORE_SUMMARY_URI = "parcelith://store/summary";
export const OPENAPI_URI = "parcelith://api/openapi.json";

function failure(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

function refusalText(error: ApiError): string {
  const details = error.details ? `\n${JSON.stringify(error.details, null, 2)}` : "";
  return `${error.message}${error.field ? ` (field: ${error.field})` : ""}${details}`;
}

const PRODUCT_STATUSES = ["draft", "in_review", "published", "archived"] as const;
const ORDER_STATUSES = ["awaiting_payment", "paid", "in_production", "shipped", "delivered", "cancelled", "exception"] as const;

async function countBy(collection: string, storeId: string, statuses: readonly string[]) {
  const counts = await Promise.all(statuses.map((status) => db.count(collection, { storeId, status })));
  return Object.fromEntries(statuses.map((status, i) => [status, counts[i]]));
}

/** The store at a glance, with figures for the areas the key may read. */
async function storeSummary(caller: ApiCaller & { store: NonNullable<ApiCaller["store"]> }) {
  const { store, key } = caller;
  const can = (resource: Parameters<typeof scopeAllows>[1]) => scopeAllows(key.scopes, resource, "read");
  const [products, orders, customers, collections, discounts] = await Promise.all([
    can("products") ? countBy(COLLECTIONS.storeProducts, store.id, PRODUCT_STATUSES) : null,
    can("orders") ? countBy(COLLECTIONS.orders, store.id, ORDER_STATUSES) : null,
    can("customers") ? db.count(COLLECTIONS.customers, { storeId: store.id }) : null,
    can("collections") ? db.count(COLLECTIONS.productCollections, { storeId: store.id }) : null,
    can("discounts") ? db.count(COLLECTIONS.discounts, { storeId: store.id, active: true }) : null,
  ]);
  return {
    store: scopeAllows(key.scopes, "store", "read") ? presentStore(store) : { id: store.id, name: store.name },
    key: { name: key.name, scopes: key.scopes },
    products: products && { byStatus: products },
    orders: orders && { byStatus: orders },
    customers: customers === null ? null : { total: customers },
    collections: collections === null ? null : { total: collections },
    activeDiscounts: discounts,
  };
}

/** The operations a key's MCP server offers as tools: platform ones for a platform key, store ones otherwise. */
export function mcpOperations(platform: boolean): ApiOperation[] {
  return API_OPERATIONS.filter((operation) => Boolean(operation.admin) === platform);
}

function registerTools(server: McpServer, caller: ApiCaller) {
  const platform = Boolean(caller.key.platform);
  for (const operation of mcpOperations(platform)) {
    const reads = operation.method === "GET";
    server.registerTool(
      toolName(operation),
      {
        title: operation.summary,
        description: `${operation.description}\n\nNeeds the ${operation.scope} scope.`,
        inputSchema: operation.input,
        annotations: {
          title: operation.summary,
          readOnlyHint: reads,
          destructiveHint: !reads && Boolean(operation.destructive),
          idempotentHint: operation.method !== "POST",
          openWorldHint: false,
        },
      },
      async (args: unknown): Promise<CallToolResult> => {
        try {
          const denied = await authorize(caller, operation);
          if (denied) {
            return failure(
              denied.code === "insufficient_scope" && !platform
                ? `This API key needs the ${operation.scope} scope. A store administrator can create a key with it under Settings → API keys.`
                : denied.message,
            );
          }
          const ctx = operation.admin ? adminContext(caller) : keyContext(caller);
          const result = await runOperation(operation, ctx, args ?? {});
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        } catch (error) {
          const refusal = refusalOf(error);
          if (refusal) return failure(refusalText(refusal));
          console.error(`MCP tool ${toolName(operation)} failed`, error);
          return failure("Something went wrong. Try again.");
        }
      },
    );
  }
}

function registerOpenApi(server: McpServer) {
  server.registerResource(
    "openapi",
    OPENAPI_URI,
    {
      title: "Admin API OpenAPI document",
      description: "The OpenAPI 3.1 description of the Admin REST API. Each operation matches one tool of this server.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(openApiDocument(), null, 2) }],
    }),
  );
}

/** The server a platform key opens: the platform administration tools. */
function platformMcpServer(caller: ApiCaller): McpServer {
  const server = new McpServer(
    { name: "parcelith", title: "Parcelith", version: "1.0.0" },
    {
      instructions: [
        `You are connected to Parcelith platform administration with the platform key “${caller.key.name}”.`,
        "The tools manage suppliers, the supplier catalog, tax brackets, agencies, supplier quotes and plan enquiries, and read the platform audit log. They do not open any store.",
        "Money is always in minor units of the currency: 2500 is 25.00.",
        "Every change is recorded in the platform audit log under the key's name. Confirm suspensions, deletions and plan changes before calling those tools.",
      ].join("\n"),
    },
  );
  registerTools(server, caller);
  registerOpenApi(server);
  return server;
}

export function storeMcpServer(caller: ApiCaller): McpServer {
  if (!caller.store) return platformMcpServer(caller);
  const store = caller.store;
  const server = new McpServer(
    { name: "parcelith", title: "Parcelith", version: "1.0.0" },
    {
      instructions: [
        `You are connected to the Parcelith store “${store.name}” (${store.id}) with the API key “${caller.key.name}”.`,
        `The key's scopes are ${caller.key.scopes.join(", ")}; a write scope includes read. Tools outside them answer with an error.`,
        "Money is always in minor units of the currency: 2500 is 25.00. Read the store summary resource, or call get_store, to learn the store's currency and languages.",
        "Every change is recorded in the store's activity under the key's name. Confirm refunds, deletions, payments and publishing with the merchant before calling those tools.",
        "Assistant suggestions are saved as pending. Apply one only when the merchant asks for it.",
      ].join("\n"),
    },
  );

  registerTools(server, caller);

  server.registerResource(
    "store-summary",
    STORE_SUMMARY_URI,
    {
      title: "Store summary",
      description: "The store's details, and how many products, orders, customers, collections and active discount codes it has.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        { uri: uri.href, mimeType: "application/json", text: JSON.stringify(await storeSummary({ ...caller, store }), null, 2) },
      ],
    }),
  );

  registerOpenApi(server);
  return server;
}

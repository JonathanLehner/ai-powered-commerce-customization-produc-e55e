import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { scopeAllows } from "../api-scopes";
import { ApiError, keyContext, type ApiCaller } from "../api/auth";
import { allows, refusalOf, runOperation } from "../api/http";
import { openApiDocument } from "../api/openapi";
import { API_OPERATIONS, toolName } from "../api/operations";
import { presentStore } from "../api/present";
import { COLLECTIONS } from "../data";
import { db } from "../mongo";

/**
 * The MCP server a store API key opens. It offers one tool per Admin API
 * operation, run through the same schema and the same store operations as the
 * REST endpoint, and two read-only resources: the store summary and the
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
async function storeSummary(caller: ApiCaller) {
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

export function storeMcpServer(caller: ApiCaller): McpServer {
  const ctx = keyContext(caller);
  const server = new McpServer(
    { name: "parcelith", title: "Parcelith", version: "1.0.0" },
    {
      instructions: [
        `You are connected to the Parcelith store “${caller.store.name}” (${caller.store.id}) with the API key “${caller.key.name}”.`,
        `The key's scopes are ${caller.key.scopes.join(", ")}; a write scope includes read. Tools outside them answer with an error.`,
        "Money is always in minor units of the currency: 2500 is 25.00. Read the store summary resource, or call get_store, to learn the store's currency and languages.",
        "Every change is recorded in the store's activity under the key's name. Confirm refunds, deletions and publishing with the merchant before calling those tools.",
      ].join("\n"),
    },
  );

  for (const operation of API_OPERATIONS) {
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
        if (!allows(caller.key.scopes, operation)) {
          return failure(`This API key needs the ${operation.scope} scope. A store administrator can create a key with it under Settings → API keys.`);
        }
        try {
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

  server.registerResource(
    "store-summary",
    STORE_SUMMARY_URI,
    {
      title: "Store summary",
      description: "The store's details, and how many products, orders, customers, collections and active discount codes it has.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(await storeSummary(caller), null, 2) }],
    }),
  );

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

  return server;
}

import "server-only";
import { z } from "zod";
import { ADMIN_SCOPE, API_RATE_LIMIT, API_RATE_WINDOW_SECONDS, API_RESOURCES, resourceWrites } from "../api-scopes";
import { SITE_ORIGIN } from "../seo";
import { fullPath } from "./define";
import { API_OPERATIONS, API_TAGS, pathParams, toolName } from "./operations";

/**
 * The OpenAPI 3.1 description of the Admin API, built from `API_OPERATIONS`,
 * so the document cannot drift from what the endpoints accept. Served at
 * `/api/v1/openapi.json` and as a resource of the MCP server.
 */

export const API_BASE = `${SITE_ORIGIN}/api/v1`;

type JsonSchema = Record<string, unknown>;

function jsonSchema(schema: z.ZodType): JsonSchema {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { $schema: _schema, ...rest } = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as JsonSchema;
  return rest;
}

const errorSchema: JsonSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: {
          type: "string",
          enum: [
            "unauthorized",
            "forbidden",
            "insufficient_scope",
            "not_found",
            "invalid_json",
            "invalid_request",
            "conflict",
            "payment_failed",
            "rate_limited",
            "internal_error",
          ],
        },
        message: { type: "string" },
        field: { type: "string", description: "The input the error is about." },
      },
    },
  },
};

const errorResponses = Object.fromEntries(
  [
    ["400", "The body is not a JSON object."],
    ["401", "No API key, or one that is not valid."],
    ["402", "The payment provider refused."],
    ["403", "The key belongs to another store, lacks the scope, or its maker no longer holds the role it needs."],
    ["404", "The record is not in this store."],
    ["409", "The record's state does not allow it."],
    ["422", "The input breaks a rule; `field` names it."],
    ["429", "Rate limit reached; see Retry-After."],
  ].map(([status, description]) => [
    status,
    { description, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
  ]),
);

export function openApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const operation of API_OPERATIONS) {
    const named = pathParams(operation);
    const shape = operation.input.shape as Record<string, z.ZodType>;
    const rest = Object.keys(shape).filter((key) => !named.includes(key));
    const inQuery = operation.method === "GET" || operation.method === "DELETE";

    const parameters = [
      ...(operation.admin
        ? []
        : [{ name: "storeId", in: "path", required: true, schema: { type: "string" }, description: "The store id. A key works for its own store only." }]),
      ...named.map((name) => ({
        name,
        in: "path",
        required: true,
        schema: jsonSchema(shape[name]),
        description: shape[name].description,
      })),
      ...(inQuery
        ? rest.map((name) => ({
            name,
            in: "query",
            required: !shape[name].safeParse(undefined).success,
            schema: jsonSchema(shape[name]),
            description: shape[name].description,
          }))
        : []),
    ];

    const path = fullPath(operation);
    paths[path] ??= {};
    paths[path][operation.method.toLowerCase()] = {
      operationId: operation.id,
      summary: operation.summary,
      description: `${operation.description}\n\nScope: \`${operation.scope}\`. MCP tool: \`${toolName(operation)}\`.`,
      tags: [operation.tag],
      security: [{ apiKey: [operation.scope] }],
      parameters,
      ...(!inQuery
        ? {
            requestBody: {
              required: rest.some((name) => !shape[name].safeParse(undefined).success),
              content: { "application/json": { schema: jsonSchema(z.object(Object.fromEntries(rest.map((key) => [key, shape[key]])))) } },
            },
          }
        : {}),
      responses: {
        [String(operation.status ?? 200)]: {
          description: "Done.",
          content: { "application/json": { schema: { type: "object" } } },
        },
        ...errorResponses,
      },
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Parcelith Admin API",
      version: "1.0.0",
      description: [
        "Run a Parcelith store from your own code: its products, artwork and mockups, collections, orders and fulfilment, customers, discounts, gift cards, reviews, pages, blog posts, menus, storefront, translations, gifting catalogues and campaigns, sourcing quotes, assistant suggestions, team, analytics, activity and settings.",
        "",
        "Create a key in the store's Settings → API keys and send it as `Authorization: Bearer <key>`. A key works for one store and carries read or write access per area; write includes read. Analytics and activity are read-only. The agency area (people, plan and stores) is offered only to keys made by the agency's administrator.",
        "",
        `Platform administrators create platform keys under Admin → API keys. A platform key holds the \`${ADMIN_SCOPE}\` scope, which no store key can hold, and runs the operations under \`/admin\` only.`,
        "",
        `Money is in minor units of the currency (2500 is 25.00). Lists return \`{ data, nextCursor }\`; pass \`nextCursor\` back as \`cursor\` for the next page. Each key may make ${API_RATE_LIMIT} requests per ${API_RATE_WINDOW_SECONDS} seconds; every answer carries X-RateLimit-Limit, X-RateLimit-Remaining and X-RateLimit-Reset.`,
        "",
        `The same operations are available to Claude and other AI assistants through the MCP server at ${SITE_ORIGIN}/api/mcp, with the same keys.`,
      ].join("\n"),
    },
    servers: [{ url: API_BASE }],
    tags: API_TAGS.map((name) => ({ name })),
    security: [{ apiKey: [] }],
    components: {
      securitySchemes: {
        apiKey: {
          type: "http",
          scheme: "bearer",
          description: `A store API key, or a platform key for the /admin operations. Store scopes: ${API_RESOURCES.flatMap((resource) =>
            resourceWrites(resource) ? [`${resource}:read`, `${resource}:write`] : [`${resource}:read`],
          ).join(", ")}. Platform scope: ${ADMIN_SCOPE}.`,
        },
      },
      schemas: { Error: errorSchema },
    },
    paths,
  };
}

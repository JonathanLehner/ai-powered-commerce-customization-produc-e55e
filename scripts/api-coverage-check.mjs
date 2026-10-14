// Self-check that every feature has a REST endpoint and an MCP tool: npm run api-coverage-check
//
// It reads every exported server action (each file under src that starts with
// "use server") and asserts that:
// - each one is named in the `actions` list of at least one API operation, or
//   is on the UI-only list in src/lib/api/ui-only-actions.ts with a reason, and
//   never both;
// - the UI-only list holds nothing but signing in or out of a browser session
//   and accepting an invitation: exactly the actions in UI_ONLY_ALLOWED below.
//   Anything else a person can do in the workspace must be an operation;
// - no operation and no UI-only entry names an action that does not exist, so
//   a renamed or deleted action cannot leave a stale claim behind;
// - each covering operation is served by the route file its path names, is in
//   the OpenAPI document, and is a tool of the MCP server the matching kind of
//   key opens (store operations for store keys, platform operations for
//   platform keys, never the other way round);
// - platform operations carry the admin scope and no store operation does.
//
// No database or server is needed: the MCP servers are listed in memory.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "src");
const ACTIONS = join(SRC, "app/actions");

const { API_OPERATIONS, toolName } = await import("../src/lib/api/operations.ts");
const { fullPath } = await import("../src/lib/api/define.ts");
const { openApiDocument } = await import("../src/lib/api/openapi.ts");
const { shopMcpServer, storeMcpServer } = await import("../src/lib/mcp/server.ts");
const { ADMIN_SCOPE, API_RESOURCES } = await import("../src/lib/api-scopes.ts");
const { UI_ONLY_ACTIONS, UI_ONLY_KINDS } = await import("../src/lib/api/ui-only-actions.ts");

/**
 * The only actions that may stay without an operation: browser sign-in and
 * sign-out (staff and shoppers, sign-up and password reset included, since each
 * ends in a signed-in session) and accepting an invitation. Growing this list
 * is a product decision, not a way to skip writing an operation.
 */
const UI_ONLY_ALLOWED = {
  "auth#signOut": "session",
  "auth#signInUser": "session",
  "auth#signInAs": "session",
  "auth#signInWithPassword": "session",
  "auth#requestPasswordReset": "session",
  "auth#resetPassword": "session",
  "signup#createAccount": "session",
  "account#signOutShopper": "session",
  "team#acceptInvitation": "invitation",
  "gifting#unlockGiftCatalogue": "invitation",
};

const failures = [];
const fail = (message) => failures.push(message);

/* ------------------------------------------------- the exported server actions */

/** Drops comments, so an example in a comment is not read as code. */
const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const serverFiles = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") walk(path);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      const source = code(readFileSync(path, "utf8")).trimStart();
      if (/^["']use server["'];?/.test(source)) serverFiles.push(path);
    }
  }
})(SRC);

/** `gifting#createGiftCatalogue` for src/app/actions/gifting.ts; other files by their path under src. */
const actionKey = (file, name) => {
  const base = file.startsWith(ACTIONS) ? relative(ACTIONS, file) : relative(SRC, file);
  return `${base.replace(/\.(ts|tsx)$/, "")}#${name}`;
};

const exported = new Set();
for (const file of serverFiles) {
  const source = code(readFileSync(file, "utf8"));
  for (const match of source.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)) exported.add(actionKey(file, match[1]));
  for (const match of source.matchAll(/^export\s+const\s+(\w+)\s*=/gm)) exported.add(actionKey(file, match[1]));
  // `export { a, b }` would hide an action from the scan; ask for the explicit form instead.
  if (/^export\s*\{[^}]*\}\s*;?$/m.test(source.replace(/^export\s+type\s*\{[^}]*\}.*$/gm, ""))) {
    fail(`${relative(ROOT, file)}: export server actions as \`export async function\`, not \`export { … }\`, so they can be checked`);
  }
}
assert.ok(exported.size > 50, `found only ${exported.size} server actions — has src/app/actions moved?`);

/* ---------------------------------------------------- coverage and allowlist */

const coveredBy = new Map();
for (const operation of API_OPERATIONS) {
  for (const action of operation.actions ?? []) {
    if (!exported.has(action)) fail(`${operation.id} names ${action}, which is not an exported server action`);
    coveredBy.set(action, [...(coveredBy.get(action) ?? []), operation]);
  }
}

for (const [action, entry] of Object.entries(UI_ONLY_ACTIONS)) {
  if (!exported.has(action)) fail(`the UI-only list names ${action}, which is not an exported server action`);
  if (!(action in UI_ONLY_ALLOWED)) {
    fail(`${action} is on the UI-only list, which may only hold session sign-in/out and invitation actions: give it an operation`);
  } else if (entry?.kind !== UI_ONLY_ALLOWED[action] || !(entry.kind in UI_ONLY_KINDS)) {
    fail(`the UI-only entry for ${action} must be of kind "${UI_ONLY_ALLOWED[action]}"`);
  }
  if (typeof entry?.reason !== "string" || entry.reason.trim().length < 20) fail(`the UI-only entry for ${action} needs a reason`);
  if (coveredBy.has(action)) {
    fail(`${action} is on the UI-only list but ${coveredBy.get(action).map((o) => o.id).join(", ")} covers it; pick one`);
  }
}

const missing = [...exported].filter((action) => !coveredBy.has(action) && !(action in UI_ONLY_ACTIONS)).sort();
for (const action of missing) {
  fail(`${action} has no REST operation or MCP tool: name it in an operation's \`actions\`, or add it to UI_ONLY_ACTIONS with a reason`);
}

/* ------------------------------------------------- REST routes and OpenAPI */

const API = join(SRC, "app/api/v1");
const routeFile = (operation) =>
  join(
    API,
    operation.admin ? "admin" : operation.shop ? "shop/[storeHandle]" : "stores/[storeId]",
    ...operation.path.split("/").filter(Boolean).map((segment) => segment.replace(/^\{(\w+)\}$/, "[$1]")),
    "route.ts",
  );

const spec = openApiDocument();
const specIds = new Set(
  Object.values(spec.paths).flatMap((methods) => Object.values(methods).map((operation) => operation.operationId)),
);
const ids = new Set();
for (const operation of API_OPERATIONS) {
  if (ids.has(operation.id)) fail(`operation id ${operation.id} is used twice`);
  ids.add(operation.id);

  const file = routeFile(operation);
  if (!existsSync(file)) {
    fail(`${operation.id}: no route file at ${relative(ROOT, file)}`);
  } else {
    const handler = operation.shop ? "shopHandler" : "restHandler";
    const source = readFileSync(file, "utf8");
    if (!new RegExp(`export const ${operation.method} = ${handler}\\("${operation.id}"\\);`).test(source)) {
      fail(`${operation.id}: ${relative(ROOT, file)} does not export ${operation.method} through ${handler}("${operation.id}")`);
    }
    if (operation.shop && !/export const OPTIONS = shopPreflight;/.test(source)) fail(`${relative(ROOT, file)} answers no browser preflight`);
  }
  if (!specIds.has(operation.id)) fail(`${operation.id} is missing from the OpenAPI document`);
  const path = spec.paths[fullPath(operation)];
  if (!path?.[operation.method.toLowerCase()]) fail(`${operation.id}: OpenAPI has no ${operation.method} ${fullPath(operation)}`);

  if (operation.shop) {
    if (!["shop:read", "shop:write"].includes(operation.scope)) fail(`${operation.id} is a Storefront API operation without a shop scope`);
    if (operation.tag !== "Storefront API") fail(`${operation.id} is a Storefront API operation outside the "Storefront API" tag`);
  } else if (operation.admin) {
    if (operation.scope !== ADMIN_SCOPE) fail(`${operation.id} is a platform operation without the ${ADMIN_SCOPE} scope`);
  } else {
    const [resource, access] = operation.scope.split(":");
    if (!API_RESOURCES.includes(resource) || !["read", "write"].includes(access)) {
      fail(`${operation.id} has the scope ${operation.scope}, which a store key cannot hold`);
    }
    if (operation.method === "GET" && access !== "read") fail(`${operation.id} reads but asks for ${operation.scope}`);
  }
}

/* ----------------------------------------------------------- the MCP servers */

async function toolsOf(callerOrServer) {
  const server = typeof callerOrServer.connect === "function" ? callerOrServer : storeMcpServer(callerOrServer);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "api-coverage-check", version: "1.0.0" });
  await client.connect(clientTransport);
  const names = [];
  // A server without a single tool does not answer tools/list at all.
  if (client.getServerCapabilities()?.tools) {
    let cursor;
    do {
      const page = await client.listTools(cursor ? { cursor } : {});
      names.push(...page.tools.map((tool) => tool.name));
      cursor = page.nextCursor;
    } while (cursor);
  }
  await client.close();
  await server.close();
  return new Set(names);
}

const key = (fields) => ({
  id: "key_check",
  name: "api-coverage-check",
  createdById: "usr_check",
  createdByName: "api-coverage-check",
  lastUsedAt: null,
  revokedAt: null,
  ...fields,
});
const storeTools = await toolsOf({
  key: key({ storeId: "str_check", agencyId: "agc_check", scopes: [] }),
  store: { id: "str_check", name: "Check store", agencyId: "agc_check" },
  headers: {},
});
const platformTools = await toolsOf({
  key: key({ storeId: null, agencyId: null, platform: true, scopes: [ADMIN_SCOPE] }),
  store: null,
  headers: {},
});

const shopTools = await toolsOf(shopMcpServer({ store: { id: "str_check", name: "Check store", slug: "check-store" }, keyId: null, ip: "127.0.0.1", paused: false, headers: {} }));

const servers = { store: storeTools, platform: platformTools, shop: shopTools };
for (const operation of API_OPERATIONS) {
  const tool = toolName(operation);
  const own = operation.admin ? "platform" : operation.shop ? "shop" : "store";
  if (!servers[own].has(tool)) fail(`${operation.id}: no MCP tool ${tool} on the ${own} MCP server`);
  for (const [name, tools] of Object.entries(servers)) {
    if (name !== own && tools.has(tool)) fail(`${operation.id}: the MCP tool ${tool} is offered on the ${name} MCP server too`);
  }
}

/* ------------------------------------------------------------------- result */

if (failures.length) {
  console.error(`api-coverage-check failed:\n${failures.map((message) => `  - ${message}`).join("\n")}`);
  process.exit(1);
}

const covered = [...exported].filter((action) => coveredBy.has(action)).length;
console.log(
  `api-coverage-check passed: ${exported.size} server actions, ${covered} covered by ${API_OPERATIONS.length} operations ` +
    `(${API_OPERATIONS.filter((o) => o.admin).length} platform, ${API_OPERATIONS.filter((o) => o.shop).length} Storefront API), ${Object.keys(UI_ONLY_ACTIONS).length} UI-only with reasons; ` +
    `${storeTools.size} store tools, ${platformTools.size} platform tools, ${shopTools.size} Storefront API tools.`,
);
process.exit(0);

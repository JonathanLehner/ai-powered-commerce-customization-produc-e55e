// Self-check for the MCP server and the Admin API it mirrors: npm run mcp-check
//
//   npm run mcp-check                              starts the production build (npm run build first)
//   npm run mcp-check -- --url http://localhost:3000   uses a server that is already running
//
// It asserts that:
// - every store operation in the OpenAPI document is an MCP tool of a store
//   key, and every tool an operation, with a description, an input schema and
//   the right read-only hint; platform operations are the tools of a platform
//   key and of no store key;
// - every operation is served by the REST route file its path names, through
//   the same registry entry;
// - with a real store API key, created for the run in the development
//   database, the tools list, the store summary and OpenAPI resources read, a
//   read tool answers with the store's data and a write tool saves and is
//   recorded in the store's activity under the key's name;
// - no key is a 401, a key without the scope is refused, and the REST API
//   answers the same key the same way;
// - a platform key runs the /admin operations and nothing in a store, a store
//   key never runs a platform operation, and a platform key whose maker is no
//   longer a platform administrator is refused;
// - the Storefront API (/shop/{storeHandle}) is served by shopHandler route
//   files, answers anonymous callers with CORS headers and a lower rate limit,
//   takes a publishable key and refuses an Admin key, the Admin API refuses a
//   publishable key, and the shop MCP server offers exactly the shop tools.
//
// The keys it creates are deleted at the end. It needs MONGODB_URI and
// MONGODB_DB from `.env.local`, and refuses to run against production.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { PRODUCTION_DB } from "./mongo.mjs";

if (!process.env.MONGODB_DB || process.env.MONGODB_DB === PRODUCTION_DB) {
  console.error("mcp-check writes test data: set MONGODB_DB to the development database (see .env.local).");
  process.exit(1);
}

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const { API_OPERATIONS, toolName } = await import("../src/lib/api/operations.ts");
const { openApiDocument } = await import("../src/lib/api/openapi.ts");
const { API_RESOURCES } = await import("../src/lib/api-scopes.ts");
const { createApiKey, createPlatformApiKey, createPublishableKey } = await import("../src/lib/api-keys.ts");
const { db } = await import("../src/lib/mongo.ts");

/* ------------------------------------------------- the registry, statically */

const spec = openApiDocument();
const allSpecOperations = Object.entries(spec.paths).flatMap(([path, methods]) =>
  Object.entries(methods).map(([method, operation]) => ({ path, method: method.toUpperCase(), id: operation.operationId })),
);
const specOperations = allSpecOperations.filter((operation) => operation.path.startsWith("/stores/"));
const adminSpecOperations = allSpecOperations.filter((operation) => operation.path.startsWith("/admin"));
const shopSpecOperations = allSpecOperations.filter((operation) => operation.path.startsWith("/shop/"));
assert.equal(
  specOperations.length + adminSpecOperations.length + shopSpecOperations.length,
  allSpecOperations.length,
  "every operation is a store, platform or Storefront API operation",
);
assert.equal(shopSpecOperations.length, API_OPERATIONS.filter((o) => o.shop).length, "Storefront API operations live under /shop");
assert.equal(allSpecOperations.length, API_OPERATIONS.length, "the OpenAPI document has one operation per registry entry");
assert.equal(new Set(allSpecOperations.map((o) => o.id)).size, allSpecOperations.length, "operationIds are unique");
assert.equal(adminSpecOperations.length, API_OPERATIONS.filter((o) => o.admin).length, "platform operations live under /admin");

// Each operation is answered by the route file at its path, exporting its
// method through the registry entry, and no route file serves anything else.
const ROUTES = join(ROOT, "src/app/api/v1");
const routeFile = (operation) =>
  join(
    ROUTES,
    operation.shop ? "shop/[storeHandle]" : operation.admin ? "admin" : "stores/[storeId]",
    ...operation.path.split("/").filter(Boolean).map((s) => s.replace(/^\{(\w+)\}$/, "[$1]")),
    "route.ts",
  );
const handlerOf = (operation) => (operation.shop ? "shopHandler" : "restHandler");
for (const operation of API_OPERATIONS) {
  const file = routeFile(operation);
  assert.ok(existsSync(file), `${operation.id}: no route file at ${file}`);
  assert.match(
    readFileSync(file, "utf8"),
    new RegExp(`export const ${operation.method} = ${handlerOf(operation)}\\("${operation.id}"\\);`),
    `${operation.id}: ${file} does not export ${operation.method} through the registry`,
  );
}
const served = { restHandler: [], shopHandler: [] };
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) walk(join(dir, entry.name));
    else if (entry.name === "route.ts") {
      for (const match of readFileSync(join(dir, entry.name), "utf8").matchAll(/(restHandler|shopHandler)\("(\w+)"\)/g)) {
        served[match[1]].push(match[2]);
      }
    }
  }
})(ROUTES);
assert.deepEqual(served.restHandler.sort(), API_OPERATIONS.filter((o) => !o.shop).map((o) => o.id).sort(), "the Admin API route files serve exactly the registry");
assert.deepEqual(served.shopHandler.sort(), API_OPERATIONS.filter((o) => o.shop).map((o) => o.id).sort(), "the Storefront API route files serve exactly its operations");
for (const file of readdirSync(join(ROUTES, "shop"), { recursive: true }).filter((name) => name.endsWith("route.ts"))) {
  assert.match(readFileSync(join(ROUTES, "shop", file), "utf8"), /export const OPTIONS = shopPreflight;/, `${file} answers the CORS preflight`);
}

/* ------------------------------------------------------------------ server */

const argUrl = process.argv.indexOf("--url");
let base = argUrl > -1 ? process.argv[argUrl + 1] : null;
let server = null;
if (!base) {
  if (!existsSync(join(ROOT, ".next/BUILD_ID"))) {
    console.error("mcp-check needs a production build (npm run build), or --url of a running server.");
    process.exit(1);
  }
  const port = 3900 + Math.floor(Math.random() * 90);
  base = `http://localhost:${port}`;
  server = spawn(join(ROOT, "node_modules/.bin/next"), ["start", "-p", String(port)], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });
  let log = "";
  server.stdout.on("data", (chunk) => (log += chunk));
  server.stderr.on("data", (chunk) => (log += chunk));
  const started = Date.now();
  for (;;) {
    try {
      if ((await fetch(`${base}/api/v1/openapi.json`)).ok) break;
    } catch {
      // Not listening yet.
    }
    if (Date.now() - started > 60_000 || server.exitCode !== null) {
      console.error(`The server did not start:\n${log}`);
      process.exit(1);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

/* -------------------------------------------------------------------- keys */

const RUN = `mcp-check ${Date.now().toString(36)}`;
const store =
  (await db.findOne("stores", { id: "str_northwind" })) ?? (await db.findOne("stores", { status: "active" }));
assert.ok(store, "the development database has a store (npm run seed)");
const person = { id: "usr_mcp_check", name: "mcp-check" };
const everything = API_RESOURCES.map((resource) => `${resource}:write`);
const full = await createApiKey(store, person, { name: RUN, scopes: everything, submissionKey: null });
const readOnly = await createApiKey(store, person, { name: `${RUN} read`, scopes: ["products:read"], submissionKey: null });
const platformAdmin = await db.findOne("users", { platformRole: "platform_admin" });
assert.ok(platformAdmin, "the development database has a platform administrator (npm run seed)");
const platformKey = await createPlatformApiKey(platformAdmin, { name: `${RUN} platform`, submissionKey: null });
// A platform key whose maker is not a platform administrator, as after a demotion.
const orphanKey = await createPlatformApiKey(person, { name: `${RUN} orphan`, submissionKey: null });
// A store key asked for the admin scope never gets it.
const sneaky = await createApiKey(store, person, { name: `${RUN} sneaky`, scopes: ["platform:admin", "products:read"], submissionKey: null });
assert.deepEqual(sneaky.key.scopes, ["products:read"], "a store key cannot hold the admin scope");
const publishable = await createPublishableKey(store, person, { name: `${RUN} publishable`, submissionKey: null });
assert.match(publishable.secret, /^plk_pub_/, "a publishable key has its own prefix");
assert.deepEqual(publishable.key.scopes, [], "a publishable key holds no scope");
const keyIds = [full.key.id, readOnly.key.id, platformKey.key.id, orphanKey.key.id, sneaky.key.id, publishable.key.id];

async function connect(secret) {
  const client = new Client({ name: "mcp-check", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${base}/api/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${secret}` } },
    }),
  );
  return client;
}

const json = (result) => {
  assert.ok(!result.isError, result.content?.[0]?.text);
  return JSON.parse(result.content[0].text);
};

try {
  /* ---------------------------------------------------------- authentication */

  const anonymous = await fetch(`${base}/api/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  assert.equal(anonymous.status, 401, "no key is a 401");
  assert.match(anonymous.headers.get("www-authenticate") ?? "", /^Bearer/);
  const forged = await fetch(`${base}/api/mcp`, {
    method: "POST",
    headers: { authorization: "Bearer plk_live_not-a-key", "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  assert.equal(forged.status, 401, "an unknown key is a 401");

  /* ------------------------------------------------------------------ tools */

  const client = await connect(full.secret);
  const { tools } = await client.listTools();
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  for (const operation of adminSpecOperations) {
    assert.ok(!byName.has(toolName(operation)), `a store key is not offered the platform tool ${toolName(operation)}`);
  }
  for (const operation of specOperations) {
    const tool = byName.get(toolName(operation));
    assert.ok(tool, `the OpenAPI operation ${operation.id} has no MCP tool ${toolName(operation)}`);
    assert.ok(tool.description && tool.description.length > 40, `${tool.name} has a description`);
    assert.equal(tool.inputSchema?.type, "object", `${tool.name} has an input schema`);
    assert.equal(tool.annotations?.readOnlyHint, operation.method === "GET", `${tool.name} read-only hint`);
  }
  assert.equal(tools.length, specOperations.length, "no tool without an OpenAPI operation");
  for (const [operationPath, operation] of [["/stores/{storeId}/products", "listProducts"], ["/stores/{storeId}/orders/{orderId}/refunds", "refundOrder"]]) {
    assert.ok(Object.values(spec.paths[operationPath]).some((o) => o.operationId === operation), `${operation} is in the document`);
  }

  /* -------------------------------------------------------------- resources */

  const { resources } = await client.listResources();
  const uris = resources.map((resource) => resource.uri);
  assert.ok(uris.includes("parcelith://store/summary") && uris.includes("parcelith://api/openapi.json"), "both resources are listed");
  const summary = JSON.parse((await client.readResource({ uri: "parcelith://store/summary" })).contents[0].text);
  assert.equal(summary.store.id, store.id, "the summary is the key's store");
  assert.equal(typeof summary.products.byStatus.published, "number");
  const document = JSON.parse((await client.readResource({ uri: "parcelith://api/openapi.json" })).contents[0].text);
  assert.equal(document.openapi, "3.1.0");

  /* ------------------------------------------------------------- read tools */

  const details = json(await client.callTool({ name: "get_store", arguments: {} }));
  assert.equal(details.id, store.id);
  assert.equal(details.name, store.name);
  const products = json(await client.callTool({ name: "list_products", arguments: { limit: 2 } }));
  assert.ok(Array.isArray(products.data) && products.data.length <= 2, "list_products pages");
  assert.ok(products.data.every((p) => p.storeId === store.id), "only the key's store's products");
  assert.ok(products.data.every((p) => !("importKey" in p)), "bookkeeping fields stay out");

  /* ------------------------------------------------------------ write tools */

  const since = new Date().toISOString();
  const theme = json(await client.callTool({ name: "get_theme", arguments: {} }));
  const saved = json(await client.callTool({ name: "update_theme", arguments: { theme: theme.theme } }));
  assert.equal(saved.theme, theme.theme, "update_theme saved the theme");
  let entry = null;
  for (let attempt = 0; attempt < 20 && !entry; attempt++) {
    entry = await db.findOne("audit_logs", { storeId: store.id, actorId: full.key.id, action: "store.branding_updated", at: { $gte: since } });
    if (!entry) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(entry, "the write is in the store's activity");
  assert.equal(entry.actorName, RUN, "under the key's name");

  // A write the operation refuses comes back as a tool error with its reason.
  const refused = await client.callTool({ name: "update_store", arguments: { name: "x" } });
  assert.equal(refused.isError, true, "a refused write is a tool error");
  assert.match(refused.content[0].text, /field: name/);
  const invalid = await client
    .callTool({ name: "update_product_status", arguments: { productId: "nope", status: "gone" } })
    .catch((error) => ({ isError: true, content: [{ type: "text", text: String(error) }] }));
  assert.equal(invalid.isError, true, "input outside the schema is refused");
  await client.close();

  /* ----------------------------------------------------------------- scopes */

  const limited = await connect(readOnly.secret);
  json(await limited.callTool({ name: "list_products", arguments: { limit: 1 } }));
  const denied = await limited.callTool({ name: "update_theme", arguments: {} });
  assert.equal(denied.isError, true, "a key without the scope is refused");
  assert.match(denied.content[0].text, /needs the storefront:write scope/);
  await limited.close();

  /* ------------------------------------------------------------------- REST */

  const rest = await fetch(`${base}/api/v1/stores/${store.id}`, { headers: { authorization: `Bearer ${full.secret}` } });
  assert.equal(rest.status, 200);
  assert.equal((await rest.json()).id, store.id, "the REST API answers the same key with the same store");
  assert.ok(rest.headers.get("x-ratelimit-limit"), "with the rate limit headers");
  const elsewhere = await fetch(`${base}/api/v1/stores/str_elsewhere`, { headers: { authorization: `Bearer ${full.secret}` } });
  assert.equal(elsewhere.status, 403, "a key works for its own store only");
  const restDenied = await fetch(`${base}/api/v1/stores/${store.id}/theme`, {
    method: "PUT",
    headers: { authorization: `Bearer ${readOnly.secret}`, "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(restDenied.status, 403);
  assert.equal((await restDenied.json()).error.code, "insufficient_scope");

  /* --------------------------------------------------------- platform keys */

  const adminRead = API_OPERATIONS.find(
    (operation) => operation.admin && operation.method === "GET" && !operation.path.includes("{") && operation.input.safeParse({}).success,
  );
  assert.ok(adminRead, "there is a platform read operation to try");
  const admin = await connect(platformKey.secret);
  const adminTools = (await admin.listTools()).tools.map((tool) => tool.name);
  assert.equal(adminTools.length, adminSpecOperations.length, "a platform key is offered the platform tools");
  assert.ok(!adminTools.includes("get_store"), "and no store tool");
  json(await admin.callTool({ name: toolName(adminRead), arguments: {} }));
  await admin.close();

  const adminUrl = `${base}/api/v1/admin${adminRead.path === "/" ? "" : adminRead.path}`;
  const adminRest = await fetch(adminUrl, { headers: { authorization: `Bearer ${platformKey.secret}` } });
  assert.equal(adminRest.status, 200, `a platform key reads ${adminUrl}`);
  const storeKeyOnAdmin = await fetch(adminUrl, { headers: { authorization: `Bearer ${full.secret}` } });
  assert.equal(storeKeyOnAdmin.status, 403, "a store key with every store scope cannot run a platform operation");
  assert.equal((await storeKeyOnAdmin.json()).error.code, "insufficient_scope");
  const platformOnStore = await fetch(`${base}/api/v1/stores/${store.id}`, { headers: { authorization: `Bearer ${platformKey.secret}` } });
  assert.equal(platformOnStore.status, 403, "a platform key opens no store");
  const orphan = await fetch(adminUrl, { headers: { authorization: `Bearer ${orphanKey.secret}` } });
  assert.equal(orphan.status, 403, "a platform key stops working when its maker is not a platform administrator");

  /* --------------------------------------------------------- Storefront API */

  const shopUrl = `${base}/api/v1/shop/${store.slug}`;
  const anonymousShop = await fetch(shopUrl);
  assert.equal(anonymousShop.status, 200, "the Storefront API answers without a key");
  assert.equal((await anonymousShop.json()).id, store.id, "for the store its handle names");
  assert.equal(anonymousShop.headers.get("access-control-allow-origin"), "*", "with CORS headers");
  assert.equal(anonymousShop.headers.get("x-ratelimit-limit"), "60", "at the anonymous rate limit");
  assert.equal((await fetch(`${base}/api/v1/shop/${store.id}`)).status, 200, "the store id works as its handle");
  assert.equal((await fetch(`${base}/api/v1/shop/no-such-store-${RUN.replace(/\W/g, "")}`)).status, 404, "an unknown store is a 404");
  const preflight = await fetch(`${shopUrl}/carts`, { method: "OPTIONS", headers: { origin: "https://example.com", "access-control-request-method": "POST" } });
  assert.equal(preflight.status, 204, "the CORS preflight is answered");
  assert.match(preflight.headers.get("access-control-allow-headers") ?? "", /X-Storefront-Key/);
  const keyed = await fetch(shopUrl, { headers: { "x-storefront-key": publishable.secret } });
  assert.equal(keyed.status, 200, "a publishable key opens its store's Storefront API");
  assert.equal(keyed.headers.get("x-ratelimit-limit"), "120", "at the key's rate limit");
  const adminKeyOnShop = await fetch(shopUrl, { headers: { authorization: `Bearer ${full.secret}` } });
  assert.equal(adminKeyOnShop.status, 401, "an Admin key is refused by the Storefront API");
  const publishableOnAdmin = await fetch(`${base}/api/v1/stores/${store.id}`, { headers: { authorization: `Bearer ${publishable.secret}` } });
  assert.equal(publishableOnAdmin.status, 401, "a publishable key is refused by the Admin API");
  const publishableOnMcp = await fetch(`${base}/api/mcp`, {
    method: "POST",
    headers: { authorization: `Bearer ${publishable.secret}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  assert.equal(publishableOnMcp.status, 401, "and by the Admin MCP server");
  const created = await fetch(`${shopUrl}/carts`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(created.status, 201, "anyone may start a cart");
  const cart = await created.json();
  assert.match(cart.cartId, /^shp_[a-z0-9]{12}$/);
  assert.equal((await fetch(`${shopUrl}/carts/${cart.cartId}`)).status, 200, "and read it back with its cartId");
  assert.equal((await fetch(`${shopUrl}/carts/shp_000000000000`)).status, 404, "an unknown cartId is a 404");
  await db.deleteMany("carts", { storeId: store.id, sessionId: cart.cartId });

  const shopper = new Client({ name: "mcp-check shop", version: "1.0.0" });
  await shopper.connect(new StreamableHTTPClientTransport(new URL(`${base}/api/mcp/shop?store=${store.slug}`)));
  const shopTools = (await shopper.listTools()).tools;
  assert.deepEqual(
    shopTools.map((tool) => tool.name).sort(),
    shopSpecOperations.map((operation) => toolName(operation)).sort(),
    "the shop MCP server offers exactly the Storefront API operations",
  );
  assert.ok(shopTools.every((tool) => !byName.has(tool.name)), "and no store key is offered a shop tool");
  assert.ok(shopTools.every((tool) => tool.description.length > 40 && tool.annotations?.readOnlyHint === (shopSpecOperations.find((o) => toolName(o) === tool.name).method === "GET")));
  assert.equal(json(await shopper.callTool({ name: "get_shop", arguments: {} })).id, store.id, "get_shop reads the store");
  await shopper.close();

  console.log(
    `mcp-check ok: ${tools.length} store tools match ${specOperations.length} OpenAPI operations, ${adminTools.length} platform tools match ${adminSpecOperations.length} and ${shopTools.length} shop tools match ${shopSpecOperations.length}; read and write tools work with real keys; the Storefront API is public, CORS-open and keeps Admin and publishable keys apart`,
  );
} finally {
  await db.deleteMany("api_keys", { id: { $in: keyIds } });
  await db.deleteMany("api_rate_limits", { keyId: { $in: keyIds } });
  await db.deleteMany("api_rate_limits", { keyId: { $regex: `^anon:${store.id}:` } });
  await db.deleteMany("audit_logs", { actorId: { $in: [...keyIds, person.id] } });
  server?.kill();
}
process.exit(0);

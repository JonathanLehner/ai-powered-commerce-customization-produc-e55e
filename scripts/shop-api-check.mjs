// Self-check for the Storefront API: npm run shop-api-check
//
// Runs the Storefront API operations in-process, through the same pipeline the
// REST routes and the shop MCP server use (schema, store context, shared shop
// code), against a demo store in the development database. Stripe is never
// called: no checkout is started.
//
// It asserts that:
// - Storefront API operations are served by shopHandler only and Admin API
//   operations by restHandler only, and the shop MCP server offers exactly the
//   Storefront API operations while a store key's server offers none of them;
// - createCart → addCartLine on a published product → getCart prices the
//   line, and the totals add up;
// - a bad discount code is refused with field `code` and the shopper copy;
// - removeCartLine empties the cart, and another cartId never opens it;
// - lookupOrder answers an unknown code and a wrong email identically.
//
// The cart it creates is deleted at the end. It needs MONGODB_URI and
// MONGODB_DB from `.env.local`, and refuses to run against production.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { PRODUCTION_DB } from "./mongo.mjs";

if (!process.env.MONGODB_DB || process.env.MONGODB_DB === PRODUCTION_DB) {
  console.error("shop-api-check writes test data: set MONGODB_DB to the development database (see .env.local).");
  process.exit(1);
}

const { API_OPERATIONS, findOperation, toolName } = await import("../src/lib/api/operations.ts");
const { refusalOf, restHandler, runShopOperation, shopHandler } = await import("../src/lib/api/http.ts");
const { shopMcpServer, storeMcpServer } = await import("../src/lib/mcp/server.ts");
const { listPublishedProducts } = await import("../src/lib/data.ts");
const { db } = await import("../src/lib/mongo.ts");

const en = JSON.parse(readFileSync(new URL("../messages/en.json", import.meta.url), "utf8")).storefront;

/* ------------------------------------------------------------ the registry */

const shopOps = API_OPERATIONS.filter((operation) => operation.shop);
assert.ok(shopOps.length >= 20, "the Storefront API operations are registered");
assert.throws(() => restHandler("getShop"), /shopHandler/, "restHandler refuses a Storefront API operation");
assert.throws(() => shopHandler("getStore"), /restHandler/, "shopHandler refuses an Admin API operation");
for (const operation of shopOps) {
  assert.ok(operation.scope === "shop:read" || operation.scope === "shop:write", `${operation.id} has a shop scope`);
  assert.ok(operation.description.length > 80, `${operation.id} is described for an agent`);
  for (const [name, field] of Object.entries(operation.input.shape)) {
    assert.ok(field.description, `${operation.id}.${name} is described`);
  }
}

async function toolsOf(server) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "shop-api-check", version: "1.0.0" });
  await client.connect(clientTransport);
  const names = client.getServerCapabilities()?.tools ? (await client.listTools()).tools.map((tool) => tool.name) : [];
  await client.close();
  await server.close();
  return names;
}

/* -------------------------------------------------------------- the store */

const stores = await db.find("stores", { demo: true, status: "active" });
let store = null;
let product = null;
for (const candidate of stores) {
  const published = await listPublishedProducts(candidate.id);
  product = published.find((p) => !p.giftCard && p.variants.some((v) => v.enabled && v.availability !== "out_of_stock"));
  if (product) {
    store = candidate;
    break;
  }
}
assert.ok(store && product, "the development database has a demo store with a published product (npm run seed)");

const caller = { store, keyId: null, ip: "127.0.0.1", paused: false, headers: {} };
const run = (id, input) => runShopOperation(findOperation(id), caller, input);
/** The refusal an operation answers with, as the API reports it. */
async function refusal(id, input) {
  try {
    await run(id, input);
  } catch (error) {
    const refused = refusalOf(error);
    if (refused) return refused;
    throw error;
  }
  assert.fail(`${id} should have been refused`);
}

const shopTools = await toolsOf(shopMcpServer(caller));
assert.deepEqual(shopTools.sort(), shopOps.map((operation) => toolName(operation)).sort(), "the shop MCP server offers the Storefront API");
const storeTools = await toolsOf(
  storeMcpServer({
    key: { id: "key_check", name: "shop-api-check", storeId: store.id, agencyId: store.agencyId, scopes: [], createdById: "usr_check", createdByName: "check", lastUsedAt: null, revokedAt: null },
    store,
    headers: {},
  }),
);
assert.ok(shopTools.every((tool) => !storeTools.includes(tool)), "a store key's MCP server offers no shop tool");

let cartId = null;
try {
  /* -------------------------------------------------------------- reading */

  const shop = await run("getShop", {});
  assert.equal(shop.id, store.id);
  assert.ok(shop.currencies.includes(shop.currency));
  const detail = await run("getShopProduct", { productHandle: product.slug });
  assert.equal(detail.id, product.id, "a product is found by its handle");
  assert.equal((await run("getShopProduct", { productHandle: product.id })).id, product.id, "and by its id");
  const variant = detail.variants.find((v) => v.available);
  assert.ok(variant, "the product has a variant on sale");
  const unsold = ["XXX", "ZZZ"].find((code) => !store.currencies.includes(code));
  const badCurrency = await refusal("getShop", { currency: unsold });
  assert.equal(badCurrency.field, "currency", "a currency the store does not sell is refused");

  /* ----------------------------------------------------------------- cart */

  const created = await run("createCart", {});
  cartId = created.cartId;
  assert.match(cartId, /^shp_[a-z0-9]{12}$/, "createCart returns a cart token");
  assert.equal(created.lines.length, 0);

  const added = await run("addCartLine", { cartId, productId: product.id, variantId: variant.id, quantity: 2 });
  assert.equal(added.lines.length, 1, "the line is in the cart");
  assert.equal(added.lines[0].quantity, 2);
  assert.equal(added.message, en.actions.addedToBasket.replace("{product}", detail.name), "with the storefront's confirmation");

  const priced = await run("getCart", { cartId });
  const line = priced.lines[0];
  assert.equal(line.unitPrice, variant.price, "priced as getShopProduct showed it");
  assert.equal(line.amount, line.unitPrice * 2);
  assert.equal(priced.subtotal, line.amount, "the subtotal adds the lines up");
  assert.equal(priced.discount, null);
  const tax = priced.tax.includedInPrices || priced.tax.calculatedAtPayment ? 0 : priced.tax.amount;
  assert.equal(priced.total, priced.subtotal + priced.shipping.amount + tax, "the total is the subtotal, shipping and tax");
  assert.equal(priced.amountDue, priced.total, "with nothing taken off by a gift card");
  assert.ok(priced.shipping.options.length > 0 && priced.shipping.selectedRateId, "a shipping rate is offered and chosen");

  const badCode = await refusal("applyCartDiscount", { cartId, code: "NO-SUCH-CODE-42" });
  assert.equal(badCode.status, 422);
  assert.equal(badCode.code, "invalid_request");
  assert.equal(badCode.field, "code", "a bad discount code is a field error on code");
  assert.equal(badCode.message, en.discount.unknown, "in the shopper copy");

  const elsewhere = await refusal("getCart", { cartId: "shp_000000000000" });
  assert.equal(elsewhere.status, 404, "another cartId never opens this cart");

  const emptied = await run("removeCartLine", { cartId, lineId: line.id });
  assert.equal(emptied.lines.length, 0, "removeCartLine takes the line out");
  assert.equal(emptied.subtotal, 0);
  assert.equal((await refusal("removeCartLine", { cartId, lineId: line.id })).status, 404, "a line that is gone is a 404");

  /* --------------------------------------------------------------- orders */

  const order = await db.findOne("orders", { storeId: store.id });
  const unknownCode = await refusal("lookupOrder", { code: "PX-NOPE00", email: "nobody@example.com" });
  assert.equal(unknownCode.message, en.actions.lookupFailed);
  if (order) {
    const wrongEmail = await refusal("lookupOrder", { code: order.code, email: `not-${order.customer.email}` });
    assert.deepEqual(
      [wrongEmail.status, wrongEmail.code, wrongEmail.message, wrongEmail.field],
      [unknownCode.status, unknownCode.code, unknownCode.message, unknownCode.field],
      "an unknown code and a wrong email fail identically",
    );
    const found = await run("lookupOrder", { code: order.code.toLowerCase(), email: order.customer.email.toUpperCase() });
    assert.equal(found.code, order.code, "the right code and email find the order");
    assert.match(found.statusUrl, /\/orders\/.+\?t=/, "with its signed status page");
  }

  console.log(
    `shop-api-check ok: ${shopOps.length} Storefront API operations on ${store.slug}; cart, totals, discount refusal and order lookup behave as the storefront does`,
  );
} finally {
  if (cartId) await db.deleteMany("carts", { storeId: store.id, sessionId: cartId });
}
process.exit(0);

// Self-check for outgoing webhooks: npm run webhook-check
//
// Runs the real webhook operations and delivery engine against a throwaway
// store in the development database. Endpoints are answered by an in-memory
// receiver: no request leaves the process.
//
// It asserts that:
// - topics and endpoint URLs are read strictly: HTTPS only, no local or private
//   network addresses, no credentials, at least one known topic;
// - every delivery is signed in the Standard Webhooks format, and the
//   `standardwebhooks` package's own verifier accepts it with the endpoint's
//   secret (and refuses a changed body, another secret, or a rotated one);
// - an event goes to each enabled endpoint subscribed to it, and nowhere else;
// - a failed delivery is retried on the backoff schedule, given up after the
//   last attempt, and never sent twice by two runners at once;
// - an endpoint that keeps failing is turned off, its pending retries are
//   cancelled, and the store team is told;
// - Resend sends the logged delivery again with the same webhook-id, and is
//   refused while the endpoint is off;
// - products, orders, customers and inventory raise their topics;
// - the endpoints are on the Admin API and MCP, for store administrators only.
//
// It needs MONGODB_URI and MONGODB_DB from `.env.local`, and refuses to run against production.
import assert from "node:assert/strict";
import { Webhook } from "standardwebhooks";
import { PRODUCTION_DB } from "./mongo.mjs";

if (!process.env.MONGODB_DB || process.env.MONGODB_DB === PRODUCTION_DB) {
  console.error("webhook-check writes test data: set MONGODB_DB to the development database (see .env.local).");
  process.exit(1);
}

/* ------------------------------------------------------------- pure rules */

const rules = await import("../src/lib/webhook-rules.ts");

assert.equal(rules.WEBHOOK_TOPICS.length, 11);
for (const topic of [
  "order.created",
  "order.paid",
  "order.fulfilled",
  "order.cancelled",
  "order.refunded",
  "product.created",
  "product.updated",
  "product.deleted",
  "customer.created",
  "customer.updated",
  "inventory.updated",
]) {
  assert.ok(rules.isWebhookTopic(topic), `${topic} is a topic`);
}
assert.deepEqual(rules.parseTopics(["order.paid", "nope", "order.created", "order.paid"]), ["order.created", "order.paid"]);
assert.deepEqual(rules.parseTopics("product.deleted, order.refunded"), ["order.refunded", "product.deleted"]);
assert.deepEqual(rules.parseTopics(undefined), []);
assert.equal(rules.topicKey("inventory.updated"), "inventory_updated");

assert.equal(rules.endpointUrlProblem("https://hooks.example.com/parcelith"), null);
assert.equal(rules.endpointUrlProblem("https://8.8.8.8/in"), null);
assert.equal(rules.endpointUrlProblem("not a url"), "invalid");
assert.equal(rules.endpointUrlProblem("http://hooks.example.com"), "https");
assert.equal(rules.endpointUrlProblem("ftp://hooks.example.com"), "https");
assert.equal(rules.endpointUrlProblem("https://user:pass@hooks.example.com"), "credentials");
for (const host of ["localhost", "app.localhost", "127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "[::1]", "[fd00::1]", "intranet", "printer.local"]) {
  assert.equal(rules.endpointUrlProblem(`https://${host}/hook`), "private", `${host} is refused`);
}
assert.equal(rules.endpointUrlProblem("https://172.32.0.1/hook"), null, "outside 172.16/12 is public");

assert.equal(rules.MAX_ATTEMPTS, 7);
const t0 = new Date("2026-01-01T00:00:00Z");
assert.equal(rules.nextAttemptAt(1, t0)?.getTime(), t0.getTime() + 60_000, "first retry a minute later");
assert.equal(rules.nextAttemptAt(2, t0)?.getTime(), t0.getTime() + 5 * 60_000, "then five minutes");
assert.equal(rules.nextAttemptAt(6, t0)?.getTime(), t0.getTime() + 18 * 3_600_000, "the last wait is the longest");
assert.equal(rules.nextAttemptAt(7, t0), null, "nothing after the last attempt");
for (let i = 2; i < rules.MAX_ATTEMPTS; i++) {
  assert.ok(rules.nextAttemptAt(i, t0) > rules.nextAttemptAt(i - 1, t0), "the backoff grows");
}
assert.ok(!rules.shouldDisable(rules.DISABLE_AFTER_FAILURES - 1));
assert.ok(rules.shouldDisable(rules.DISABLE_AFTER_FAILURES));
assert.ok(rules.deliveredStatus(200) && rules.deliveredStatus(204));
assert.ok(!rules.deliveredStatus(301) && !rules.deliveredStatus(500) && !rules.deliveredStatus(null));
assert.deepEqual(JSON.parse(rules.webhookPayload("order.paid", { id: "ord_1" }, t0)), {
  type: "order.paid",
  timestamp: t0.toISOString(),
  data: { id: "ord_1" },
});

/* ---------------------------------------------------- the in-memory receiver */

/** What each endpoint URL answers, and every request it received. */
const receiver = { answers: new Map(), requests: [], stray: 0, hold: null };
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  if (!receiver.answers.has(url)) {
    receiver.stray += 1;
    throw new Error(`webhook-check makes no network calls (${url})`);
  }
  const headers = new Headers(init.headers);
  receiver.requests.push({ url, body: String(init.body), headers: Object.fromEntries(headers.entries()), redirect: init.redirect });
  if (receiver.hold) await receiver.hold;
  const answer = receiver.answers.get(url);
  if (answer === "timeout") {
    const error = new Error("The operation was aborted due to timeout");
    error.name = "TimeoutError";
    throw error;
  }
  if (answer === "down") throw new TypeError("fetch failed");
  return new Response(answer === 200 ? "ok" : "nope", { status: answer });
};
const sentTo = (url) => receiver.requests.filter((r) => r.url === url);

/* --------------------------------------------------------- against the db */

const { db, mongoClient, mongoDatabaseName } = await import("../src/lib/mongo.ts");
const { ensureIndexes } = await import("../src/lib/db-indexes.ts");
await ensureIndexes((await mongoClient()).db(mongoDatabaseName()));
const { COLLECTIONS, updateStoreProduct } = await import("../src/lib/data.ts");
const webhooks = await import("../src/lib/webhooks.ts");
const ops = await import("../src/lib/operations/webhooks.ts");
const products = await import("../src/lib/operations/products.ts");
const { runScheduledWork } = await import("../src/lib/scheduler.ts");
const { findOperation, toolName } = await import("../src/lib/api/operations.ts");
const { STORE_ADMIN_RESOURCES } = await import("../src/lib/api-scopes.ts");

const quiet = console.error;
console.error = () => {};

const RUN = `whk${Date.now().toString(36)}`;
const template = (await db.findOne(COLLECTIONS.stores, { id: "str_northwind" })) ?? (await db.findOne(COLLECTIONS.stores, { status: "active" }));
assert.ok(template, "the development database has a store (npm run seed)");
const store = { ...template, id: `str_${RUN}`, slug: `webhook-check-${RUN}`, customDomain: null, domainHosts: [] };
delete store._id;
await db.insertOne(COLLECTIONS.stores, store);
const ctx = { store, actor: { id: "usr_webhook_check", name: "Webhook Check" }, locale: "en" };
const refusal = async (promise) => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail("expected a refusal");
};
const delivery = (id) => db.findOne(COLLECTIONS.webhookDeliveries, { id });
const endpointOf = (id) => db.findOne(COLLECTIONS.webhookEndpoints, { id });
const verify = (secret, request) =>
  new Webhook(secret).verify(request.body, {
    "webhook-id": request.headers["webhook-id"],
    "webhook-timestamp": request.headers["webhook-timestamp"],
    "webhook-signature": request.headers["webhook-signature"],
  });
const due = (id) =>
  db.updateOne(COLLECTIONS.webhookDeliveries, { id }, { $set: { nextAttemptAt: new Date(Date.now() - 1000).toISOString() } });

const ORDERS = "https://orders.example.com/hook";
const PRODUCTS = "https://products.example.com/hook";
const OFF = "https://off.example.com/hook";

try {
  /* --------------------------------------------------------------- endpoints */

  const created = await ops.createEndpoint(ctx, {
    url: ` ${ORDERS} `,
    topics: ["order.paid", "order.created", "bogus"],
    description: "ERP",
    submissionKey: `${RUN}-a`,
  });
  assert.equal(created.url, ORDERS, "the URL is trimmed");
  assert.deepEqual(created.topics, ["order.created", "order.paid"], "unknown topics are dropped");
  assert.match(created.secret, /^whsec_[A-Za-z0-9+/]{32}$/, "a Standard Webhooks secret of 24 random bytes");
  assert.equal(created.enabled, true);
  const again = await ops.createEndpoint(ctx, { url: ORDERS, topics: ["order.paid"], submissionKey: `${RUN}-a` });
  assert.equal(again.id, created.id, "a resubmitted form returns the endpoint it added");
  assert.equal((await refusal(ops.createEndpoint(ctx, { url: ORDERS, topics: ["order.paid"] }))).field, "url", "the same URL twice is refused");
  assert.equal((await refusal(ops.createEndpoint(ctx, { url: "http://insecure.example.com", topics: ["order.paid"] }))).field, "url");
  assert.equal((await refusal(ops.createEndpoint(ctx, { url: "https://127.0.0.1/x", topics: ["order.paid"] }))).field, "url");
  assert.equal((await refusal(ops.createEndpoint(ctx, { url: "https://new.example.com", topics: [] }))).field, "topics");

  const productHook = await ops.createEndpoint(ctx, { url: PRODUCTS, topics: ["product.updated", "product.deleted", "product.created"] });
  const offHook = await ops.createEndpoint(ctx, { url: OFF, topics: ["order.paid"] });
  await ops.updateEndpoint(ctx, offHook, { enabled: false });
  assert.equal((await endpointOf(offHook.id)).disabledReason, "manual");
  receiver.answers.set(ORDERS, 200).set(PRODUCTS, 200).set(OFF, 200);

  /* ------------------------------------------------- signing and fan-out */

  const ids = await webhooks.enqueueWebhook(store.id, "order.paid", async () => ({ id: "ord_check", total: 2500 }));
  assert.equal(ids.length, 1, "one delivery: the products endpoint is not subscribed and the other one is off");
  assert.equal(sentTo(ORDERS).length, 1, "tried straight away");
  assert.equal(sentTo(OFF).length, 0, "an endpoint that is off receives nothing");
  const first = sentTo(ORDERS)[0];
  assert.equal(first.headers["webhook-id"], ids[0], "the delivery id is the webhook-id");
  assert.equal(first.headers["content-type"], "application/json");
  assert.match(first.headers["webhook-signature"], /^v1,[A-Za-z0-9+/=]+$/, "an HMAC-SHA256 v1 signature");
  assert.equal(first.redirect, "manual", "redirects are not followed");
  const verified = verify(created.secret, first);
  assert.equal(verified.type, "order.paid");
  assert.deepEqual(verified.data, { id: "ord_check", total: 2500 });
  assert.throws(() => verify(created.secret, { ...first, body: first.body.replace("2500", "1") }), "a changed body fails verification");
  assert.throws(() => verify(productHook.secret, first), "another endpoint's secret fails verification");
  const ok = await delivery(ids[0]);
  assert.equal(ok.status, "succeeded");
  assert.equal(ok.responseCode, 200);
  assert.equal(ok.attempts.length, 1);
  assert.equal((await endpointOf(created.id)).lastStatus, "succeeded");
  assert.deepEqual(await webhooks.enqueueWebhook(store.id, "customer.updated", async () => ({})), [], "nobody listens to this topic");
  assert.deepEqual(await webhooks.enqueueWebhook(store.id, "order.paid", async () => null), [], "a record that is gone sends nothing");

  /* --------------------------------------------------------------- retries */

  receiver.answers.set(ORDERS, 503);
  const [retryId] = await webhooks.enqueueWebhook(store.id, "order.created", async () => ({ id: "ord_retry" }));
  let row = await delivery(retryId);
  assert.equal(row.status, "retrying");
  assert.equal(row.responseCode, 503);
  const wait = new Date(row.nextAttemptAt).getTime() - new Date(row.attempts[0].at).getTime();
  assert.ok(wait >= 59_000 && wait <= 61_000, "the first retry waits a minute");
  assert.equal(await webhooks.attemptDelivery(retryId), null, "not tried again before it is due");
  await due(retryId);
  // Two runners at once: the lease lets one through.
  const before = sentTo(ORDERS).length;
  let release;
  receiver.hold = new Promise((resolve) => (release = resolve));
  const racing = Promise.all([webhooks.attemptDelivery(retryId), webhooks.attemptDelivery(retryId)]);
  await new Promise((resolve) => setTimeout(resolve, 200));
  release();
  receiver.hold = null;
  const raced = await racing;
  assert.equal(raced.filter(Boolean).length, 1, "only one runner takes a due delivery");
  assert.equal(sentTo(ORDERS).length, before + 1, "and it is sent once");
  row = await delivery(retryId);
  assert.equal(row.attempts.length, 2);
  assert.equal(row.attempts[1].responseCode, 503);
  assert.equal(sentTo(ORDERS).at(-1).headers["webhook-id"], retryId, "a retry keeps its webhook-id");

  receiver.answers.set(ORDERS, "timeout");
  await due(retryId);
  await webhooks.runDueDeliveries();
  row = await delivery(retryId);
  assert.equal(row.attempts.at(-1).error, "timeout", "a timeout is logged as one");
  assert.equal(row.attempts.at(-1).responseCode, null);
  receiver.answers.set(ORDERS, 200);
  await due(retryId);
  await webhooks.runDueDeliveries();
  row = await delivery(retryId);
  assert.equal(row.status, "succeeded", "delivered on a later attempt");
  assert.equal((await endpointOf(created.id)).failureStreak, 0, "a success clears the failure streak");

  // Every attempt used up.
  receiver.answers.set(ORDERS, "down");
  const [lostId] = await webhooks.enqueueWebhook(store.id, "order.created", async () => ({ id: "ord_lost" }));
  for (let i = 1; i < rules.MAX_ATTEMPTS; i++) {
    await due(lostId);
    await webhooks.attemptDelivery(lostId);
  }
  row = await delivery(lostId);
  assert.equal(row.attempts.length, rules.MAX_ATTEMPTS);
  assert.equal(row.status, "failed", "given up after the last attempt");
  assert.equal(row.nextAttemptAt, null);
  assert.equal(row.attempts.at(-1).error, "network");

  /* ---------------------------------------------------------------- resend */

  receiver.answers.set(ORDERS, 200);
  const resent = await ops.resendDelivery(ctx, row);
  assert.equal(resent.status, "succeeded");
  assert.equal(resent.attempts.length, rules.MAX_ATTEMPTS + 1);
  assert.equal(resent.attempts.at(-1).manual, true);
  assert.equal(sentTo(ORDERS).at(-1).headers["webhook-id"], lostId, "a resend keeps its webhook-id");
  assert.ok(verify(created.secret, sentTo(ORDERS).at(-1)));

  /* ------------------------------------------------------ rotating a secret */

  const rotated = await ops.rotateSecret(ctx, await endpointOf(created.id));
  assert.notEqual(rotated.secret, created.secret);
  await webhooks.enqueueWebhook(store.id, "order.paid", async () => ({ id: "ord_rotated" }));
  assert.ok(verify(rotated.secret, sentTo(ORDERS).at(-1)), "signed with the new secret");
  assert.throws(() => verify(created.secret, sentTo(ORDERS).at(-1)), "the old secret no longer verifies");

  /* --------------------------------------------------------- auto-disable */

  receiver.answers.set(ORDERS, 500);
  const failing = [];
  for (let i = 0; i < rules.DISABLE_AFTER_FAILURES - 1; i++) {
    failing.push(...(await webhooks.enqueueWebhook(store.id, "order.paid", async () => ({ id: `ord_fail_${i}` }))));
  }
  assert.equal((await endpointOf(created.id)).enabled, true, "still on one failure short of the limit");
  failing.push(...(await webhooks.enqueueWebhook(store.id, "order.paid", async () => ({ id: "ord_last_straw" }))));
  const disabled = await endpointOf(created.id);
  assert.equal(disabled.enabled, false, `turned off after ${rules.DISABLE_AFTER_FAILURES} failures in a row`);
  assert.equal(disabled.disabledReason, "failures");
  const pending = await db.count(COLLECTIONS.webhookDeliveries, { endpointId: created.id, status: { $in: ["pending", "retrying"] } });
  assert.equal(pending, 0, "its pending retries are cancelled");
  assert.equal((await delivery(failing[0])).status, "cancelled");
  assert.deepEqual(await webhooks.enqueueWebhook(store.id, "order.paid", async () => ({})), [], "nothing more is sent to it");
  let audit = null;
  for (let i = 0; i < 40 && !audit; i++) {
    audit = await db.findOne(COLLECTIONS.audit, { storeId: store.id, action: "webhook.disabled" });
    if (!audit) await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(audit, "the store's activity records it");
  const { NOTIFICATION_TYPES, DEFAULT_NOTIFICATION_PREFS } = await import("../src/lib/notifications.ts");
  assert.ok(NOTIFICATION_TYPES.includes("webhook_disabled"), "the store team is notified");
  assert.deepEqual(DEFAULT_NOTIFICATION_PREFS.webhook_disabled, { inApp: true, email: true }, "in the app and by email");
  assert.equal((await refusal(ops.resendDelivery(ctx, await delivery(failing[0])))).code, "conflict", "no resend while it is off");
  const back = await ops.updateEndpoint(ctx, disabled, { enabled: true });
  assert.equal(back.failureStreak, 0, "turning it back on starts afresh");
  assert.equal(back.disabledReason, null);

  /* ------------------------------------------------------------ the wiring */

  const productId = `stp_${RUN}`;
  await db.insertOne(COLLECTIONS.storeProducts, { id: productId, storeId: store.id, name: "Check mug", variants: [], status: "draft" });
  const sentBefore = sentTo(PRODUCTS).length;
  await updateStoreProduct(productId, { name: "Check mug v2" });
  await webhooks.settleWebhookWork();
  const updated = sentTo(PRODUCTS).slice(sentBefore).map((r) => JSON.parse(r.body));
  assert.equal(updated.length, 1);
  assert.equal(updated[0].type, "product.updated", "saving a product raises product.updated");
  assert.equal(updated[0].data.name, "Check mug v2", "with the product as it is now");
  await products.deleteProduct(ctx, { id: productId, name: "Check mug v2" });
  await webhooks.settleWebhookWork();
  const deleted = JSON.parse(sentTo(PRODUCTS).at(-1).body);
  assert.equal(deleted.type, "product.deleted");
  assert.equal(deleted.data.id, productId);
  assert.ok(verify(productHook.secret, sentTo(PRODUCTS).at(-1)));

  const { readFileSync } = await import("node:fs");
  const source = (path) => readFileSync(new URL(`../src/lib/${path}`, import.meta.url), "utf8");
  const wiring = {
    "order.created": ["order-payment.ts", "gift-payment.ts"],
    "order.paid": ["order-payment.ts", "gift-payment.ts"],
    "order.fulfilled": ["operations/orders.ts"],
    "order.cancelled": ["operations/orders.ts"],
    "order.refunded": ["operations/orders.ts"],
    "product.created": ["catalog-import.ts", "shopify-import.ts", "operations/gift-cards.ts"],
    "product.updated": ["data.ts", "shopify-import.ts", "operations/gift-cards.ts"],
    "customer.created": ["customer-data.ts", "operations/customers.ts"],
    "customer.updated": ["customer-data.ts", "operations/customers.ts"],
  };
  for (const [topic, files] of Object.entries(wiring)) {
    for (const file of files) assert.ok(source(file).includes(`"${topic}"`), `${file} raises ${topic}`);
  }
  assert.ok(source("inventory.ts").includes("emitInventoryWebhook"), "stock changes raise inventory.updated");
  assert.ok(source("operations/products.ts").includes("emitProductDeleted"), "deleting a product raises product.deleted");

  /* ---------------------------------------------------------- the scheduler */

  receiver.answers.set(ORDERS, 200);
  const [laterId] = await webhooks.enqueueWebhook(store.id, "order.paid", async () => ({ id: "ord_later" }));
  assert.equal((await delivery(laterId)).status, "succeeded");
  receiver.answers.set(ORDERS, 500);
  const [dueId] = await webhooks.enqueueWebhook(store.id, "order.paid", async () => ({ id: "ord_due" }));
  await due(dueId);
  receiver.answers.set(ORDERS, 200);
  await db.deleteOne(COLLECTIONS.jobLeases, { id: "scheduler" });
  const [runA, runB] = await Promise.all([runScheduledWork(), runScheduledWork()]);
  assert.ok((runA === null) !== (runB === null), "one scheduler run at a time");
  assert.equal((await delivery(dueId)).status, "succeeded", "the scheduler retries what is due");
  await db.deleteOne(COLLECTIONS.jobLeases, { id: "scheduler" });

  /* --------------------------------------------------------- API and MCP */

  for (const id of [
    "listWebhookEndpoints",
    "createWebhookEndpoint",
    "getWebhookEndpoint",
    "updateWebhookEndpoint",
    "rotateWebhookSecret",
    "deleteWebhookEndpoint",
    "listWebhookDeliveries",
    "resendWebhookDelivery",
  ]) {
    const operation = findOperation(id);
    assert.ok(operation, `${id} is on the Admin API`);
    assert.ok(operation.scope.startsWith("webhooks:"), `${id} needs the webhooks scope`);
    assert.match(toolName(operation), /webhook/, `${id} is the MCP tool ${toolName(operation)}`);
  }
  assert.ok(STORE_ADMIN_RESOURCES.includes("webhooks"), "only store administrators' keys manage webhooks");

  await ops.deleteEndpoint(ctx, await endpointOf(productHook.id));
  assert.equal(await endpointOf(productHook.id), null);
  assert.equal(await db.count(COLLECTIONS.webhookDeliveries, { endpointId: productHook.id }), 0, "its log goes with it");

  assert.equal(receiver.stray, 0, "no request left the process");
  console.error = quiet;
  console.log(
    `webhook-check ok: ${receiver.requests.length} deliveries to in-memory endpoints, each verified with standardwebhooks where checked`,
  );
} finally {
  console.error = quiet;
  await webhooks.settleWebhookWork().catch(() => {});
  const endpoints = await db.find(COLLECTIONS.webhookEndpoints, { storeId: store.id });
  await db.deleteMany(COLLECTIONS.webhookDeliveries, { storeId: store.id });
  await db.deleteMany(COLLECTIONS.webhookEndpoints, { id: { $in: endpoints.map((e) => e.id) } });
  await db.deleteMany(COLLECTIONS.storeProducts, { storeId: store.id });
  await db.deleteMany(COLLECTIONS.notifications, { storeId: store.id });
  await db.deleteMany(COLLECTIONS.stores, { id: store.id });
  await new Promise((resolve) => setTimeout(resolve, 300));
  await db.deleteMany(COLLECTIONS.audit, { storeId: store.id });
}
process.exit(0);

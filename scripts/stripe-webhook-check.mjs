// Self-check for the Stripe webhook: npm run stripe-webhook-check
//
// Sends signed events through the same handler POST /api/stripe/webhook runs,
// against throwaway records in the development database, and asserts that:
// - an unsigned or wrongly signed request is refused and leaves no trace;
// - a completed Checkout session marks the order paid and routes it, once:
//   the same event delivered again, and the async-succeeded event for the same
//   session, change nothing;
// - a session from another account cannot settle the order;
// - account.updated refreshes the store's Connect status;
// - invoice.payment_failed puts the agency's plan past due, and the
//   subscription events move it on.
//
// No request reaches Stripe: the key is a made-up test key and fetch fails on
// any call. It needs MONGODB_URI and MONGODB_DB from `.env.local`, and refuses
// to run against production.
import assert from "node:assert/strict";
import Stripe from "stripe";
import { PRODUCTION_DB } from "./mongo.mjs";

if (!process.env.MONGODB_DB || process.env.MONGODB_DB === PRODUCTION_DB) {
  console.error("stripe-webhook-check writes test data: set MONGODB_DB to the development database (see .env.local).");
  process.exit(1);
}
process.env.STRIPE_SECRET_KEY = "sk_test_webhook_check";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_webhook_check";
delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
delete process.env.RESEND_API_KEY;
globalThis.fetch = async (url) => {
  throw new Error(`stripe-webhook-check makes no network calls (${url})`);
};

const { db } = await import("../src/lib/mongo.ts");
const { COLLECTIONS } = await import("../src/lib/data.ts");
const { handleStripeWebhook } = await import("../src/lib/stripe-webhook.ts");

// Outside a Next request, cache revalidation and the email's translations log
// errors the handler deliberately rides over; they are not what is checked.
const quiet = console.error;
console.error = () => {};

const RUN = `whk${Date.now().toString(36)}`;
const ACCOUNT = `acct_${RUN}`;
const SESSION = `cs_test_${RUN}`;
const cryptoProvider = Stripe.createSubtleCryptoProvider();

async function deliver(event, { secret = "whsec_webhook_check", body } = {}) {
  const payload = body ?? JSON.stringify({ object: "event", api_version: "2026-09-30.endive", created: 1, livemode: false, ...event });
  const signature = await Stripe.webhooks.generateTestHeaderStringAsync({ payload, secret, cryptoProvider });
  return handleStripeWebhook(payload, signature);
}

/* ------------------------------------------------------------ the dataset */

const template = await db.findOne(COLLECTIONS.stores, { id: "str_rivet" });
assert.ok(template, "the seeded rivet-hardware store is in the development database (npm run seed)");
const agency = {
  id: `agc_${RUN}`,
  name: "Webhook Check Agency",
  slug: RUN,
  plan: "studio",
  contactEmail: "owner@example.com",
  status: "active",
  createdAt: new Date().toISOString(),
  billing: {
    status: "active",
    plan: "studio",
    cycle: "monthly",
    currency: "EUR",
    checkoutSessionId: null,
    stripeCustomerId: `cus_${RUN}`,
    stripeSubscriptionId: `sub_${RUN}`,
    activatedAt: new Date().toISOString(),
  },
};
const store = {
  ...template,
  id: `str_${RUN}`,
  slug: `webhook-check-${RUN}`,
  agencyId: agency.id,
  customDomain: null,
  demo: false,
  stripe: { connected: true, express: true, accountId: ACCOUNT, country: "US", chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, connectedAt: new Date().toISOString() },
};
delete store._id;
const paidTemplate = await db.findOne(COLLECTIONS.orders, { storeId: "str_rivet", "campaign.campaignId": { $exists: false } });
assert.ok(paidTemplate, "the seeded store has an order to copy");
const order = {
  ...paidTemplate,
  id: `ord_${RUN}`,
  storeId: store.id,
  code: `ORD-${RUN.toUpperCase()}`,
  status: "awaiting_payment",
  discount: null,
  refunds: [],
  events: [{ at: new Date().toISOString(), status: "Order placed", note: "Awaiting payment on Stripe Checkout.", actor: "Shopper" }],
  payment: {
    provider: "stripe",
    status: "requires_payment",
    paymentIntentId: null,
    stripeAccountId: ACCOUNT,
    last4: null,
    failureMessage: null,
    paidAt: null,
    checkoutSessionId: SESSION,
  },
  fulfillment: { supplierId: null, supplierName: null, routing: "pending", supplierOrderRef: null, submittedAt: null, submissionMessage: null, carrier: null, trackingNumber: null, trackingUrl: null, exception: null },
  cartId: null,
  campaign: null,
  idempotencyKey: `idem_${RUN}`,
};
delete order._id;
await db.insertOne(COLLECTIONS.agencies, agency);
await db.insertOne(COLLECTIONS.stores, store);
await db.insertOne(COLLECTIONS.orders, order);

const session = (extra = {}) => ({
  id: SESSION,
  object: "checkout.session",
  mode: "payment",
  status: "complete",
  payment_status: "paid",
  amount_total: order.total,
  currency: order.currency.toLowerCase(),
  payment_intent: `pi_${RUN}`,
  client_reference_id: order.id,
  metadata: { kind: "order", orderId: order.id, storeId: store.id, code: order.code },
  ...extra,
});
const reload = () => db.findOne(COLLECTIONS.orders, { id: order.id });
const claims = (id) => db.count(COLLECTIONS.stripeEvents, { id });

try {
  /* ------------------------------------------------------ signatures */

  const forged = await deliver({ id: `evt_${RUN}_forged`, type: "checkout.session.completed", account: ACCOUNT, data: { object: session() } }, { secret: "whsec_not_ours" });
  assert.equal(forged.status, 400, "a wrongly signed event is refused");
  assert.equal(await claims(`evt_${RUN}_forged`), 0, "and leaves no claim behind");
  assert.equal((await reload()).status, "awaiting_payment", "the redirect alone, or a forged event, never marks an order paid");
  const unsigned = await handleStripeWebhook(JSON.stringify({ id: `evt_${RUN}_unsigned` }), null);
  assert.equal(unsigned.status, 400);

  /* ------------------------------------------------- another account */

  const stranger = await deliver({ id: `evt_${RUN}_stranger`, type: "checkout.session.completed", account: "acct_someone_else", data: { object: session() } });
  assert.deepEqual([stranger.status, stranger.body.outcome], [200, "unknown_order"], "another account's session cannot settle this order");
  assert.equal((await reload()).status, "awaiting_payment");

  /* ------------------------------------------------- paid, exactly once */

  const completed = { id: `evt_${RUN}_completed`, type: "checkout.session.completed", account: ACCOUNT, data: { object: session() } };
  const first = await deliver(completed);
  assert.deepEqual([first.status, first.body.outcome], [200, "order_paid"]);
  const paid = await reload();
  assert.equal(paid.payment.status, "succeeded");
  assert.equal(paid.payment.paymentIntentId, `pi_${RUN}`, "the intent is kept for refunds");
  assert.ok(["paid", "in_production", "exception"].includes(paid.status), `routed after payment (${paid.status})`);
  assert.ok(paid.events.some((e) => e.status === "Payment captured"));
  const eventsAfterFirst = paid.events.length;

  const again = await deliver(completed);
  assert.deepEqual([again.status, again.body.duplicate], [200, true], "a redelivery is acknowledged as a duplicate");
  assert.equal(await claims(completed.id), 1, "one claim per event id");
  const async = await deliver({ id: `evt_${RUN}_async`, type: "checkout.session.async_payment_succeeded", account: ACCOUNT, data: { object: session() } });
  assert.equal(async.body.outcome, "order_already_settled", "a second event for the same payment changes nothing");
  const expired = await deliver({ id: `evt_${RUN}_expired`, type: "checkout.session.expired", account: ACCOUNT, data: { object: session({ status: "expired" }) } });
  assert.equal(expired.body.outcome, "order_already_settled", "a paid order is never closed by a late expiry");
  const settled = await reload();
  assert.equal(settled.events.length, eventsAfterFirst, "no duplicate timeline entries");
  assert.equal(settled.payment.status, "succeeded");

  /* -------------------------------------------------------- Connect */

  const updated = await deliver({
    id: `evt_${RUN}_account`,
    type: "account.updated",
    account: ACCOUNT,
    data: { object: { id: ACCOUNT, object: "account", country: "US", charges_enabled: false, payouts_enabled: false, details_submitted: true } },
  });
  assert.equal(updated.body.outcome, "store_refreshed");
  const refreshed = await db.findOne(COLLECTIONS.stores, { id: store.id });
  assert.deepEqual([refreshed.stripe.chargesEnabled, refreshed.stripe.payoutsEnabled, refreshed.setup.payments], [false, false, false]);

  /* ---------------------------------------------------- plan billing */

  const failed = await deliver({ id: `evt_${RUN}_invoice`, type: "invoice.payment_failed", data: { object: { id: `in_${RUN}`, object: "invoice", customer: `cus_${RUN}` } } });
  assert.equal(failed.body.outcome, "plan_past_due");
  assert.equal((await db.findOne(COLLECTIONS.agencies, { id: agency.id })).billing.status, "past_due", "the workspace banner reads this");

  const subscription = (status, extra = {}) => ({
    id: `sub_${RUN}`,
    object: "subscription",
    status,
    cancel_at_period_end: false,
    metadata: { agencyId: agency.id },
    items: { object: "list", data: [{ id: "si_1", current_period_end: 1798761600 }] },
    ...extra,
  });
  const recovered = await deliver({ id: `evt_${RUN}_sub_active`, type: "customer.subscription.updated", data: { object: subscription("active") } });
  assert.equal(recovered.body.outcome, "plan_active");
  const active = await db.findOne(COLLECTIONS.agencies, { id: agency.id });
  assert.equal(active.billing.status, "active");
  assert.equal(active.billing.currentPeriodEnd, new Date(1798761600 * 1000).toISOString());
  const ended = await deliver({ id: `evt_${RUN}_sub_deleted`, type: "customer.subscription.deleted", data: { object: subscription("canceled") } });
  assert.equal(ended.body.outcome, "plan_canceled");
  assert.equal((await db.findOne(COLLECTIONS.agencies, { id: agency.id })).billing.status, "canceled");

  const ignored = await deliver({ id: `evt_${RUN}_other`, type: "customer.created", data: { object: { id: "cus_x", object: "customer" } } });
  assert.deepEqual([ignored.status, ignored.body.outcome], [200, "ignored"], "other events are acknowledged");
} finally {
  await db.deleteMany(COLLECTIONS.orders, { storeId: store.id });
  await db.deleteMany(COLLECTIONS.customers, { storeId: store.id });
  await db.deleteMany(COLLECTIONS.audit, { $or: [{ storeId: store.id }, { agencyId: agency.id }] });
  await db.deleteMany(COLLECTIONS.notifications, { storeId: store.id });
  await db.deleteMany(COLLECTIONS.stores, { id: store.id });
  await db.deleteMany(COLLECTIONS.agencies, { id: agency.id });
  await db.deleteMany(COLLECTIONS.stripeEvents, { id: { $regex: `^evt_${RUN}` } });
}

console.error = quiet;
console.log("stripe-webhook-check ok");
process.exit(0);

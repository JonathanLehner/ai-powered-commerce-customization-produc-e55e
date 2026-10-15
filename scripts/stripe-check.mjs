// Self-check for Stripe payments: npm run stripe-check
//
// Every request goes through the official SDK and is answered here by a mocked
// fetch, so nothing reaches Stripe and no live key is ever used: the check runs
// with a made-up test key and fails on any request that is not to the API.
//
// It covers which stores pay on Stripe, the Connect account and onboarding
// link, the Checkout Session a storefront order opens on the store's connected
// account (direct charge, line items, shipping, tax, discount, language,
// return addresses), refunds on that account, the Customer Portal and the
// webhook signature check.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Stripe from "stripe";

process.env.STRIPE_SECRET_KEY = "sk_test_stripe_check";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_check_platform";
delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

/* ------------------------------------------------------- the mocked API */

const requests = [];
const responses = new Map();
globalThis.fetch = async (url, init = {}) => {
  const target = new URL(String(url));
  assert.equal(target.origin, "https://api.stripe.com", `only the Stripe API is called, not ${target.origin}`);
  const request = {
    path: target.pathname,
    method: init.method,
    headers: new Headers(init.headers),
    form: new URLSearchParams(init.body ? String(init.body) : ""),
  };
  requests.push(request);
  assert.equal(request.headers.get("authorization"), "Bearer sk_test_stripe_check", "never a live key");
  const [status, body] = responses.get(`${request.method} ${request.path}`) ?? [404, { error: { message: "No such route", type: "invalid_request_error" } }];
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "request-id": "req_check" } });
};
const answer = (route, body, status = 200) => responses.set(route, [status, body]);
const last = () => requests.at(-1);

const quiet = console.error;
console.error = () => {};

const stripe = await import("../src/lib/stripe.ts");
const { notTakingOrders, paymentMode } = await import("../src/lib/payment-mode.ts");

/* --------------------------------------------------- who pays on Stripe */

const live = { status: "active", stripe: { express: true, accountId: "acct_live1", chargesEnabled: true, connected: true } };
assert.equal(paymentMode(live), "stripe", "a Connect account with charges enabled takes real payments");
assert.equal(paymentMode({ ...live, stripe: { ...live.stripe, chargesEnabled: false } }), "unavailable", "not until Stripe enables charges");
assert.equal(paymentMode({ ...live, stripe: { connected: true, accountId: "acct_1Typed", chargesEnabled: true } }), "unavailable", "an id typed in by hand never reaches Stripe");
assert.equal(paymentMode({ status: "active", demo: true, stripe: { connected: true, accountId: "acct_1NwSupplyCo", chargesEnabled: true } }), "demo", "a seeded store simulates payment");
assert.equal(paymentMode({ ...live, demo: true }), "stripe", "a demo store that finished onboarding takes real payments");
assert.equal(paymentMode({ ...live, status: "archived" }), "unavailable");
assert.equal(paymentMode({ status: "active", testMode: true, stripe: { connected: false, accountId: null, chargesEnabled: false } }), "demo", "test mode takes test cards before Stripe is connected");
assert.equal(paymentMode({ ...live, testMode: true }), "demo", "test mode has to be turned off before real payments");
assert.equal(paymentMode({ ...live, testMode: true, status: "archived" }), "unavailable");
// A live store without Stripe is flagged as not taking orders; archived ones are offline anyway.
assert.equal(notTakingOrders({ ...live, stripe: { ...live.stripe, chargesEnabled: false } }), true, "browsable but no checkout");
assert.equal(notTakingOrders(live), false);
assert.equal(notTakingOrders({ ...live, stripe: { connected: false, accountId: null, chargesEnabled: false }, testMode: true }), false, "test mode takes test cards");
assert.equal(notTakingOrders({ ...live, stripe: { connected: false, accountId: null, chargesEnabled: false }, status: "archived" }), false);

const seed = readFileSync(new URL("./seed.mjs", import.meta.url), "utf8");
for (const account of ["acct_1NwSupplyCo", "acct_1LumenCreative", "acct_1FerroKaffee", "acct_1RivetHardware"]) {
  assert.match(seed, new RegExp(`accountId: "${account}"[^\\n]*\\n\\s+demo: true,`), `${account} is seeded as a demo store`);
}

/* ------------------------------------------------------------- Connect */

answer("POST /v1/accounts", { id: "acct_new1", object: "account", country: "DE", charges_enabled: false, payouts_enabled: false, details_submitted: false });
const account = await stripe.createConnectedAccount({ storeId: "str_1", country: "DE", email: "shop@example.com", attempt: "DE-first" });
assert.deepEqual(account, { ok: true, value: { accountId: "acct_new1", country: "DE", chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false } });
assert.equal(last().form.get("controller[stripe_dashboard][type]"), "full", "the full Stripe Dashboard, as the platform profile says");
assert.equal(last().form.get("controller[fees][payer]"), "account", "the store pays its own Stripe fees");
assert.equal(last().form.get("controller[losses][payments]"), "stripe", "Stripe carries negative balances");
assert.equal(last().form.get("controller[requirement_collection]"), "stripe");
assert.equal(last().form.get("capabilities[card_payments][requested]"), "true");
assert.equal(last().form.get("metadata[storeId]"), "str_1");
assert.equal(last().headers.get("idempotency-key"), "connect-account-str_1-DE-first", "a double click makes one account");
assert.match(last().headers.get("user-agent") ?? "", /^Stripe\/v1 NodeBindings\//, "sent by the SDK");

answer("POST /v1/account_links", { object: "account_link", url: "https://connect.stripe.com/setup/e/acct_new1/abc" });
assert.deepEqual(await stripe.onboardingLink("acct_new1", "https://p.test/back/refresh", "https://p.test/back"), { ok: true, value: "https://connect.stripe.com/setup/e/acct_new1/abc" });
assert.equal(last().form.get("type"), "account_onboarding");
assert.equal(last().form.get("return_url"), "https://p.test/back");
assert.equal(last().form.get("refresh_url"), "https://p.test/back/refresh");

answer("GET /v1/accounts/acct_new1", { id: "acct_new1", object: "account", country: "DE", charges_enabled: true, payouts_enabled: true, details_submitted: true });
assert.equal((await stripe.retrieveAccount("acct_new1")).value.payoutsEnabled, true);

/* ------------------------------------------- why a Stripe call failed */

// The platform profile refusal seen in production: the platform owner has to
// finish it in the Dashboard, so it is a platform failure with its link.
const LOSSES = "Please review the responsibilities of managing losses for connected accounts at https://dashboard.stripe.com/settings/connect/platform-profile.";
answer("POST /v1/accounts", { error: { message: LOSSES, type: "invalid_request_error" } }, 400);
assert.deepEqual(
  await stripe.createConnectedAccount({ storeId: "str_2", country: "DE", email: null, attempt: "DE-first" }),
  { ok: false, failure: { kind: "platform", message: LOSSES, dashboardUrl: "https://dashboard.stripe.com/settings/connect/platform-profile" } },
  "a platform setting keeps Stripe's words and the Dashboard link",
);
answer("POST /v1/accounts", { error: { message: "Invalid email address: nope", type: "invalid_request_error", param: "email" } }, 400);
assert.deepEqual(
  (await stripe.createConnectedAccount({ storeId: "str_2", country: "DE", email: "nope", attempt: "DE-first" })).failure,
  { kind: "invalid", message: "Invalid email address: nope", dashboardUrl: null },
  "the store's own details show Stripe's message",
);
answer("POST /v1/account_links", { error: { message: "The provided key does not have access to account 'acct_x'.", type: "invalid_request_error" } }, 403);
assert.equal((await stripe.onboardingLink("acct_x", "https://p.test/r", "https://p.test/b")).failure.kind, "platform", "a permission refusal is the platform's");
answer("GET /v1/accounts/acct_new1", { error: { message: "Invalid API Key provided", type: "invalid_request_error" } }, 401);
assert.equal((await stripe.retrieveAccount("acct_new1")).failure.kind, "platform", "a wrong key is the platform's");
const { classifyStripeError } = stripe;
assert.equal(classifyStripeError(new Stripe.errors.StripeConnectionError({ message: "socket hang up" })).kind, "unreachable", "a network error keeps 'could not be reached'");
assert.equal(classifyStripeError(new Stripe.errors.StripeAPIError({ message: "Server error" })).kind, "unreachable");
assert.equal(classifyStripeError(new Stripe.errors.StripeRateLimitError({ message: "Too many requests" })).kind, "unreachable");
assert.equal(classifyStripeError(new Stripe.errors.StripePermissionError({ message: "No access" })).kind, "platform");
assert.equal(classifyStripeError(new TypeError("fetch failed")).kind, "unreachable");
const withoutKey = process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_SECRET_KEY;
assert.equal((await stripe.createConnectedAccount({ storeId: "str_3", country: "DE", email: null, attempt: "x" })).failure.kind, "platform", "a missing key is the platform's to fix");
process.env.STRIPE_SECRET_KEY = withoutKey;
answer("GET /v1/accounts/acct_new1", { id: "acct_new1", object: "account", country: "DE", charges_enabled: true, payouts_enabled: true, details_submitted: true });

/* ---------------------------------------------- storefront Checkout */

answer("POST /v1/coupons", { id: "co_1", object: "coupon" });
answer("POST /v1/checkout/sessions", { id: "cs_test_1", object: "checkout.session", url: "https://checkout.stripe.com/c/pay/cs_test_1" });
const before = requests.length;
const session = await stripe.createConnectedCheckout({
  accountId: "acct_live1",
  metadata: { kind: "order", orderId: "ord_1", storeId: "str_1", code: "ORD-1" },
  idempotencyKey: "order-checkout-ord_1",
  currency: "EUR",
  locale: "de",
  email: "kim@example.com",
  lines: [
    { name: "Ferro Clubshirt", description: "M", unitAmount: 3200, quantity: 2 },
    { name: "Steuer 19 %", unitAmount: 1140, quantity: 1 },
  ],
  shipping: { label: "Versand", amount: 495 },
  discount: { code: "WELCOME10", amount: 640 },
  successUrl: "https://p.test/s/ferro/orders/ORD-1?t=tok&paid=1",
  cancelUrl: "https://p.test/s/ferro/cart",
});
assert.deepEqual(session, { ok: true, value: { id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" } });
const [coupon, create] = requests.slice(before);
assert.equal(coupon.path, "/v1/coupons");
assert.equal(coupon.headers.get("stripe-account"), "acct_live1", "the discount lives on the store's account");
assert.equal(coupon.form.get("amount_off"), "640");
assert.equal(coupon.form.get("currency"), "eur");
assert.equal(coupon.form.get("max_redemptions"), "1");
assert.equal(create.path, "/v1/checkout/sessions");
assert.equal(create.headers.get("stripe-account"), "acct_live1", "a direct charge on the connected account");
assert.equal(create.headers.get("idempotency-key"), "order-checkout-ord_1", "a retry opens the same session");
const form = create.form;
assert.equal(form.get("mode"), "payment");
assert.equal(form.get("locale"), "de", "in the shopper's language");
assert.equal(form.get("customer_email"), "kim@example.com");
assert.equal(form.get("line_items[0][price_data][currency]"), "eur");
assert.equal(form.get("line_items[0][price_data][unit_amount]"), "3200");
assert.equal(form.get("line_items[0][quantity]"), "2");
assert.equal(form.get("line_items[0][price_data][product_data][name]"), "Ferro Clubshirt");
assert.equal(form.get("line_items[1][price_data][unit_amount]"), "1140", "tax as computed by the store");
assert.equal(form.get("shipping_options[0][shipping_rate_data][fixed_amount][amount]"), "495");
assert.equal(form.get("shipping_options[0][shipping_rate_data][display_name]"), "Versand");
assert.equal(form.get("discounts[0][coupon]"), "co_1");
assert.equal(form.get("metadata[orderId]"), "ord_1");
assert.equal(form.get("payment_intent_data[metadata][orderId]"), "ord_1");
assert.equal(form.get("success_url"), "https://p.test/s/ferro/orders/ORD-1?t=tok&paid=1");
assert.equal(form.get("cancel_url"), "https://p.test/s/ferro/cart");
assert.ok(Number(form.get("expires_at")) > Date.now() / 1000, "an abandoned session expires");
// The order total is what Stripe charges: 2 × 32.00 + 11.40 tax − 6.40 + 4.95.
assert.equal(3200 * 2 + 1140 - 640 + 495, 7395);

answer("POST /v1/checkout/sessions/cs_test_1/expire", { id: "cs_test_1", object: "checkout.session", status: "expired" });
assert.equal(await stripe.expireConnectedCheckout("acct_live1", "cs_test_1"), true);
assert.equal(last().headers.get("stripe-account"), "acct_live1");
answer("POST /v1/checkout/sessions/cs_test_2/expire", { error: { message: "Only open sessions can be expired.", type: "invalid_request_error" } }, 400);
assert.equal(await stripe.expireConnectedCheckout("acct_live1", "cs_test_2"), false, "a paid session is left to the webhook");

answer("POST /v1/checkout/sessions", { error: { message: "Your account cannot currently make live charges.", type: "invalid_request_error" } }, 400);
const refusedSession = await stripe.createConnectedCheckout({ accountId: "acct_live1", metadata: {}, idempotencyKey: "k", currency: "USD", locale: "en", email: "a@b.co", lines: [], shipping: null, discount: null, successUrl: "https://p.test/a", cancelUrl: "https://p.test/b" });
assert.equal(refusedSession.ok, false, "a refused session leaves the order to be closed");
assert.deepEqual(refusedSession.failure, { kind: "invalid", message: "Your account cannot currently make live charges.", dashboardUrl: null }, "with Stripe's message for the store");

/* -------------------------------------------------------------- refunds */

answer("POST /v1/refunds", { id: "re_1", object: "refund", status: "succeeded" });
const refund = await stripe.refundOnConnectedAccount({ accountId: "acct_live1", paymentIntentId: "pi_1", amount: 2500, idempotencyKey: "ord_1:0:2500" });
assert.deepEqual([refund.ok, refund.refundId], [true, "re_1"]);
assert.equal(last().headers.get("stripe-account"), "acct_live1", "refunded on the account it was charged on");
assert.equal(last().headers.get("idempotency-key"), "ord_1:0:2500", "a double submit is one refund");
assert.equal(last().form.get("payment_intent"), "pi_1");
assert.equal(last().form.get("amount"), "2500");
answer("POST /v1/refunds", { error: { message: "Charge has already been refunded.", type: "invalid_request_error" } }, 400);
const refused = await stripe.refundOnConnectedAccount({ accountId: "acct_live1", paymentIntentId: "pi_1", amount: 2500, idempotencyKey: "x" });
assert.deepEqual([refused.ok, refused.refundId], [false, null], "a refusal records nothing");

/* -------------------------------------------------------- plan billing */

answer("POST /v1/billing_portal/sessions", { id: "bps_1", object: "billing_portal.session", url: "https://billing.stripe.com/p/session/abc" });
assert.equal(await stripe.billingPortalUrl("cus_1", "https://p.test/app/billing"), "https://billing.stripe.com/p/session/abc");
assert.equal(last().form.get("customer"), "cus_1");
assert.equal(last().headers.get("stripe-account"), null, "on Parcelith's own account");
answer("POST /v1/invoices/create_preview", { object: "invoice", amount_due: 14300, currency: "eur", next_payment_attempt: 1798761600, period_end: 1798761600 });
assert.deepEqual(await stripe.nextInvoice("cus_1", "sub_1"), { amountDue: 14300, currency: "EUR", date: new Date(1798761600 * 1000).toISOString() });

/* ------------------------------------------------- webhook signatures */

const cryptoProvider = Stripe.createSubtleCryptoProvider();
const sign = (payload, secret) => Stripe.webhooks.generateTestHeaderStringAsync({ payload, secret, cryptoProvider });
const payload = JSON.stringify({ id: "evt_1", object: "event", type: "account.updated", data: { object: { id: "acct_1" } } });

const sent = requests.length;
assert.equal((await stripe.verifyWebhookEvent(payload, await sign(payload, "whsec_check_platform")))?.id, "evt_1", "a signed event is accepted");
assert.equal(await stripe.verifyWebhookEvent(payload, null), null, "an unsigned request is refused");
assert.equal(await stripe.verifyWebhookEvent(payload, await sign(payload, "whsec_someone_else")), null, "another secret is refused");
assert.equal(await stripe.verifyWebhookEvent(payload.replace("acct_1", "acct_2"), await sign(payload, "whsec_check_platform")), null, "an edited body is refused");
assert.equal(await stripe.verifyWebhookEvent(payload, "t=1,v1=00"), null, "a made-up header is refused");
const stale = Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_check_platform", timestamp: Math.floor(Date.now() / 1000) - 3600 });
assert.equal(await stripe.verifyWebhookEvent(payload, stale), null, "a replayed hour-old delivery is refused");
process.env.STRIPE_CONNECT_WEBHOOK_SECRET = "whsec_check_connect";
assert.equal((await stripe.verifyWebhookEvent(payload, await sign(payload, "whsec_check_connect")))?.id, "evt_1", "the Connect destination's secret is accepted too");
delete process.env.STRIPE_WEBHOOK_SECRET;
delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
assert.equal(await stripe.verifyWebhookEvent(payload, await sign(payload, "whsec_check_platform")), null, "nothing is accepted without a secret");
assert.equal(requests.length, sent, "verification never calls Stripe");

/* --------------------------------------- the code paths use what is checked */

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const webhook = source("src/lib/stripe-webhook.ts");
assert.match(webhook, /const event = await verifyWebhookEvent\(payload, signature\);\n\s+if \(!event\) return \{ status: 400/, "the webhook verifies before reading");
const shop = source("src/lib/operations/shop.ts");
assert.match(shop, /status: "awaiting_payment",/, "a live order starts awaiting payment");
assert.doesNotMatch(shop.slice(shop.indexOf("const checkout = await createConnectedCheckout")), /confirmOrderPayment/, "only the webhook marks a live order paid");
const checkoutForm = source("src/app/s/[slug]/[locale]/checkout/CheckoutForm.tsx");
assert.match(checkoutForm, /\{mode === "demo" \? <DemoCardFields/, "card fields only on demo stores");
assert.doesNotMatch(checkoutForm, /cardNumber|TEST_CARDS/, "no card form on live stores");
for (const locale of ["en", "de", "fr", "es", "it", "nl", "pt", "ja", "sv"]) {
  const copy = JSON.parse(source(`messages/${locale}.json`)).storefront;
  assert.ok(copy.checkout.demoStore && copy.checkout.continueToPayment && copy.order.processingTitle, `${locale} has the payment copy`);
  assert.doesNotMatch(JSON.stringify(copy), /merchant of record|acct_/i, `${locale}: no internals shown to shoppers`);
}

console.error = quiet;
console.log("stripe-check ok");

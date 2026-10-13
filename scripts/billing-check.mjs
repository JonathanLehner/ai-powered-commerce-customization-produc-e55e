// Self-check for plan billing: npm run billing-check
//
// Plan checkout goes through the official Stripe SDK, sign-up starts a free
// trial with no card, and while STRIPE_SECRET_KEY is unset nothing on the
// sign-up path can start an account that cannot be paid for.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LOCALES } from "../src/i18n/locales.ts";
import { matchesRoute } from "../src/lib/routes.ts";

const source = (path) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");

/* ------------------------------------------------- calls go through the SDK */

// The client lives in lib/stripe.ts, shared with storefront payments.
const billing = source("src/lib/billing.ts");
const sdk = source("src/lib/stripe.ts");
assert.match(sdk, /^import Stripe from "stripe";$/m, "stripe.ts uses the stripe package");
assert.match(billing, /from "\.\/stripe";$/m, "billing.ts uses the shared client");
for (const file of [billing, sdk]) {
  assert.doesNotMatch(file, /\bfetch\(|api\.stripe\.com|URLSearchParams|x-www-form-urlencoded/, "no hand-written Stripe requests");
}
for (const call of ["Stripe.createFetchHttpClient()", "Stripe.createSubtleCryptoProvider()", "webhooks.constructEventAsync("]) {
  assert.ok(sdk.includes(call), `stripe.ts calls ${call}`);
}
for (const call of ["checkout.sessions.create(", "checkout.sessions.retrieve(", "idempotencyKey:"]) {
  assert.ok(billing.includes(call), `billing.ts calls ${call}`);
}

// Every request the module makes has to be the SDK's: recorded here, it carries
// the SDK's own headers and form encoding.
const requests = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  requests.push({ url: String(url), method: init.method, headers: new Headers(init.headers), body: init.body ? String(init.body) : "" });
  const session = {
    id: "cs_test_123",
    object: "checkout.session",
    url: "https://checkout.stripe.com/c/pay/cs_test_123",
    status: "open",
    client_reference_id: "agy_1",
    customer: { id: "cus_1", object: "customer" },
    subscription: "sub_1",
  };
  return new Response(JSON.stringify(session), { status: 200, headers: { "content-type": "application/json", "request-id": "req_1" } });
};

const { billingConfigured, billingPending, canStartCheckout, getCheckoutSession, startPlanCheckout, trialDaysLeft } = await import(
  "../src/lib/billing.ts"
);
const agency = { id: "agy_1", billing: { status: "pending", plan: "studio", cycle: "yearly", currency: "EUR" } };
const checkout = { agency, email: "mara@studio-lind.com", origin: "https://parcelith.test", locale: "de" };

/* ------------------------------------------------ while no key is configured */

delete process.env.STRIPE_SECRET_KEY;
const quiet = console.error;
console.error = () => {};
assert.equal(billingConfigured(), false);
assert.equal(await startPlanCheckout(checkout), null, "no Checkout without a key");
assert.equal(await getCheckoutSession("cs_test_123"), null);
console.error = quiet;
assert.equal(requests.length, 0, "nothing is sent to Stripe without a key");

// Sign-up refuses before anything is written.
const signup = source("src/app/actions/signup.ts");
const guard = signup.indexOf("if (!billingConfigured())");
assert.ok(guard > 0, "createAccount checks for billing");
assert.ok(guard < signup.indexOf("getUserByEmail("), "the check runs before any account lookup");
assert.ok(guard < signup.indexOf("insertOne("), "the check runs before any account is created");

// Pricing and sign-up are swapped for their contact-sales copies by the proxy.
const proxy = source("src/proxy.ts");
assert.match(proxy, /withoutSelfServe\(request, localizeMarketing\(request\)\)/);
assert.match(proxy, /billingConfigured\(\)/);
assert.match(proxy, /CONTACT_SALES_PAGES = \["\/pricing", "\/signup"\]/);
for (const locale of LOCALES) {
  assert.ok(matchesRoute(`/${locale}/pricing/contact-sales`) && matchesRoute(`/${locale}/signup/contact-sales`), locale);
}
assert.match(source("src/app/[locale]/pricing/contact-sales/page.tsx"), /selfServe=\{false\}/);
assert.match(source("src/app/[locale]/pricing/page.tsx"), /selfServe \/>/);
const view = source("src/app/[locale]/pricing/view.tsx");
assert.match(view, /cta: selfServe && PLANS\[key\]\.prices !== null \? t\("getStarted"\) : t\("contactSales"\)/);
assert.match(view, /href: selfServe && PLANS\[key\]\.prices !== null \? `\/signup\?plan=\$\{key\}` : `\/contact\?plan=\$\{key\}`/);
const unavailable = source("src/app/[locale]/signup/contact-sales/page.tsx");
assert.match(unavailable, /href="\/contact"/);
assert.doesNotMatch(unavailable, /SignupForm|createAccount/, "the contact-sales page has no sign-up form");

for (const locale of LOCALES) {
  const { signup: copy } = JSON.parse(source(`messages/${locale}.json`));
  assert.ok(copy.unavailableTitle && copy.unavailableLead?.includes("<link>") && copy.errors.unavailable, `${locale} has the copy`);
}
const en = JSON.parse(source("messages/en.json")).signup;
assert.equal(`${en.unavailableTitle}. ${en.unavailableLead.replace(/<\/?link>/g, "")}`, "Online sign-up opens soon. Contact sales to get started.");

/* ---------------------------------------------------- once a key is set */

process.env.STRIPE_SECRET_KEY = "sk_test_billing_check";
assert.equal(billingConfigured(), true);
const session = await startPlanCheckout(checkout);
assert.deepEqual(session, {
  id: "cs_test_123",
  url: "https://checkout.stripe.com/c/pay/cs_test_123",
  status: "open",
  client_reference_id: "agy_1",
  customer: "cus_1",
  subscription: "sub_1",
});
const [create] = requests;
assert.equal(create.method, "POST");
assert.equal(create.url, "https://api.stripe.com/v1/checkout/sessions");
assert.equal(create.headers.get("authorization"), "Bearer sk_test_billing_check");
assert.equal(create.headers.get("idempotency-key"), "plan-checkout-agy_1-studio-yearly-EUR-14");
assert.match(create.headers.get("user-agent") ?? "", /^Stripe\/v1 NodeBindings\//, "sent by the SDK");
assert.ok(create.headers.get("stripe-version"), "the SDK pins its API version");
const form = new URLSearchParams(create.body);
assert.equal(form.get("mode"), "subscription");
assert.equal(form.get("locale"), "de");
assert.equal(form.get("line_items[0][price_data][recurring][interval]"), "year");
assert.equal(form.get("line_items[0][price_data][currency]"), "eur");
assert.equal(form.get("line_items[0][price_data][unit_amount]"), "143000", "Studio yearly is charged €1,430");
assert.equal(form.get("subscription_data[trial_period_days]"), "14");
assert.equal(form.get("metadata[agencyId]"), "agy_1");

assert.equal((await getCheckoutSession("cs_test_123"))?.customer, "cus_1");
assert.equal(requests[1].method, "GET");
assert.equal(requests[1].url, "https://api.stripe.com/v1/checkout/sessions/cs_test_123");
assert.equal(await getCheckoutSession("not-a-session"), null, "odd ids never reach Stripe");
assert.equal(requests.length, 2);

// The same plan paid in dollars is charged the dollar list price.
await startPlanCheckout({ ...checkout, agency: { ...agency, billing: { ...agency.billing, plan: "starter", cycle: "monthly", currency: "USD" } } });
const usd = new URLSearchParams(requests[2].body);
assert.equal(usd.get("line_items[0][price_data][currency]"), "usd");
assert.equal(usd.get("line_items[0][price_data][unit_amount]"), "3900");
assert.equal(usd.get("line_items[0][price_data][recurring][interval]"), "month");

/* ------------------------------------------------- the no-card free trial */

const DAY = 24 * 60 * 60 * 1000;
const trialing = (endsIn) => ({
  id: "agy_1",
  billing: { ...agency.billing, status: "trialing", trialEndsAt: new Date(Date.now() + endsIn).toISOString() },
});

// Sign-up starts a trial with no Checkout; the workspace stays open until it ends.
assert.match(signup, /status: "trialing"/);
assert.match(signup, /trialEndsAt: new Date\(Date\.parse\(now\) \+ TRIAL_DAYS \* 24 \* 60 \* 60 \* 1000\)/);
assert.equal(trialDaysLeft(trialing(14 * DAY - 1000)), 14);
assert.equal(trialDaysLeft(trialing(DAY / 2)), 1);
assert.equal(billingPending(trialing(DAY / 2)), false, "a running trial is not blocked");
assert.equal(billingPending(trialing(-1000)), true, "an ended trial asks for payment");
assert.equal(billingPending(agency), true, "a card-first sign-up still finishes checkout");
assert.equal(billingPending({ billing: { ...agency.billing, status: "active" } }), false);
assert.ok(canStartCheckout(trialing(5 * DAY)) && canStartCheckout(trialing(-1000)) && canStartCheckout(agency));
assert.equal(canStartCheckout({ billing: { ...agency.billing, status: "active" } }), false);

// Adding a card mid-trial keeps the days left; too close to the end, Stripe bills at once.
const midTrial = trialing(5 * DAY);
await startPlanCheckout({ ...checkout, agency: midTrial });
const mid = new URLSearchParams(requests[3].body);
assert.equal(mid.get("subscription_data[trial_end]"), String(Math.floor(Date.parse(midTrial.billing.trialEndsAt) / 1000)));
assert.equal(mid.get("subscription_data[trial_period_days]"), null);
await startPlanCheckout({ ...checkout, agency: trialing(DAY) });
const late = new URLSearchParams(requests[4].body);
assert.equal(late.get("subscription_data[trial_end]"), null);
assert.equal(late.get("subscription_data[trial_period_days]"), null);
assert.match(requests[4].headers.get("idempotency-key"), /-none$/);

for (const locale of LOCALES) {
  const { billing: copy } = JSON.parse(source(`messages/${locale}.json`));
  assert.ok(copy.status.trialing && copy.addPayment && copy.trialBanner && copy.trialEndedTitle, `${locale} has the trial copy`);
}
assert.match(JSON.parse(source("messages/en.json")).signup.lead, /no credit card required/);

globalThis.fetch = realFetch;
console.log("billing-check ok");

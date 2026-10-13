// Self-check for shopper support contacts: npm run support-check
//
// The order status page and the storefront footer are the only routes a shopper
// has back to the seller, so what they show has to come from what the store
// actually saved — never from a guess at the client's name.
import assert from "node:assert/strict";
import {
  isSupportEmail,
  isSupportPhone,
  storeSupport,
  supportMailto,
  supportTel,
} from "../src/lib/support.ts";
import { setupProgress, setupRemaining, setupStatus } from "../src/lib/metrics.ts";
import { SETUP_STEPS } from "../src/lib/types.ts";

/* ------------------------------------------------------ reading the record */

assert.deepEqual(storeSupport({ supportEmail: " Support@Northwind.example ", supportPhone: " +1 503 555 0142 " }), {
  email: "support@northwind.example",
  phone: "+1 503 555 0142",
});

// A store saved before support contacts existed carries neither field, and a
// store that only answers email carries no number. Both read as absent, which
// is what makes the page fall back to "not published yet" instead of a button.
assert.deepEqual(storeSupport({}), { email: null, phone: null });
assert.deepEqual(storeSupport({ supportEmail: null, supportPhone: null }), { email: null, phone: null });
assert.deepEqual(storeSupport({ supportEmail: "hello@lumen.example" }), {
  email: "hello@lumen.example",
  phone: null,
});

// Nothing is derived from the client name: an address that was never saved
// stays absent rather than becoming northwindtechnologies@example.com.
assert.equal(storeSupport({ supportEmail: "", supportPhone: "" }).email, null);
assert.equal(storeSupport({ supportEmail: "not-an-address" }).email, null);

/* ----------------------------------------------------------- what is valid */

assert.equal(isSupportEmail("support@northwind.example"), true);
assert.equal(isSupportEmail(" support@northwind.example "), true);
assert.equal(isSupportEmail("support@northwind"), false);
assert.equal(isSupportEmail("support at northwind.example"), false);
assert.equal(isSupportEmail(""), false);

assert.equal(isSupportPhone("+1 503 555 0142"), true);
assert.equal(isSupportPhone("(020) 7946-0918"), true);
assert.equal(isSupportPhone("555"), false, "too few digits to dial");
assert.equal(isSupportPhone("call us maybe"), false);

/* ------------------------------------------------------------------- links */

assert.equal(supportMailto("support@northwind.example"), "mailto:support@northwind.example");
assert.equal(
  supportMailto("Support@Northwind.example", "Order ORD-42871904"),
  "mailto:support@northwind.example?subject=Order%20ORD-42871904",
);
assert.equal(supportTel("+1 (503) 555-0142"), "tel:+15035550142");

/* ------------------------------------------------------- setup step counting */

assert.ok(SETUP_STEPS.includes("support"), "support is a guided setup step");
assert.ok(SETUP_STEPS.includes("zones"), "shipping zones are a guided setup step");

const complete = { branding: true, localisation: true, support: true, domain: true, payments: true, shipping: true, tax: true };
assert.deepEqual(setupProgress(setupStatus(complete, true)), { done: 10, total: 10, pct: 100 });

// A brand-new store: languages, currencies and policies are already ticked on
// the Settings page, so the progress bar has to count exactly those three.
const fresh = { branding: false, localisation: true, support: false, domain: false, payments: false, shipping: false, tax: false };
const freshStatus = setupStatus(fresh, false);
assert.deepEqual(
  SETUP_STEPS.filter((step) => freshStatus[step]),
  ["languages", "localisation", "policies"],
);
assert.deepEqual(setupProgress(freshStatus), { done: 3, total: 10, pct: 30 });
assert.deepEqual(setupRemaining(freshStatus).toSell, ["payments", "shipping", "zones"]);

// Everything stored is done but no zone has a rate: checkout has nothing to
// offer, so setup is not finished and selling is still blocked.
const noZones = setupStatus(complete, false);
assert.equal(setupProgress(noZones).done, 9);
assert.deepEqual(setupRemaining(noZones), { toSell: ["zones"], optional: [] });

// The bug this counting exists for: a store stored before the step existed has
// no `support` key, and counting only stored keys reported it as 100% set up.
const legacy = { branding: true, localisation: true, domain: true, payments: true, shipping: true, tax: true };
const progress = setupProgress(setupStatus(legacy, true));
assert.equal(progress.total, 10);
assert.equal(progress.done, 9);
assert.ok(progress.pct < 100, "a store with no support contact is not finished");

// Northwind: payments, carriers and zones are done, only the domain is left.
// Nothing blocks selling, so the settings page must not ask for any of them.
const northwind = setupStatus({ ...complete, domain: false }, true);
assert.deepEqual(setupRemaining(northwind), { toSell: [], optional: ["domain"] });
assert.deepEqual(setupRemaining(setupStatus({ ...complete, shipping: false, domain: false }, true)), {
  toSell: ["shipping"],
  optional: ["domain"],
});
assert.deepEqual(setupRemaining({}).toSell, ["payments", "shipping", "zones"]);
assert.deepEqual(setupRemaining(setupStatus(complete, true)), { toSell: [], optional: [] });

console.log("support-check ok");

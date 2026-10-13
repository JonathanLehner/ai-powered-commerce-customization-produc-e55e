// Self-check for transactional email: npm run email-check
//
// An email leaves the platform and cannot be corrected afterwards, so what it
// says has to hold in every language a store can be run in: the store's own
// branding at the top, no placeholder left unfilled, and the link the message
// exists for actually in it.
import assert from "node:assert/strict";
import { LOCALES } from "../src/i18n/locales.ts";
import { emailCopyFor, shopperT } from "./shopper-intl.mjs";
import {
  brandFor,
  giftApprovalEmail,
  orderCancelledEmail,
  orderConfirmationEmail,
  orderDeliveredEmail,
  refundIssuedEmail,
  shippingNotificationEmail,
  teamInviteEmail,
} from "../src/lib/email-templates.ts";

const store = {
  name: "Northwind Supply",
  clientName: "Northwind Technologies",
  logoUrl: "https://assets.clawcorp.ai/logos/northwind.png",
  defaultLanguage: "en",
  supportEmail: " Support@Northwind.example ",
};

/* ------------------------------------------------- branding off the record */

const brand = brandFor(store);
assert.equal(brand.storeName, "Northwind Supply");
assert.equal(brand.clientName, "Northwind Technologies");
assert.equal(brand.supportEmail, "support@northwind.example", "the address is normalised, not guessed");
assert.equal(brandFor({ ...store, supportEmail: null }).supportEmail, null);
assert.equal(brandFor({ ...store, supportEmail: "" }).supportEmail, null);

/* --------------------------------------------------------- the four emails */

const order = {
  customerName: "Priya Raman",
  code: "ORD-7HQ4K2",
  total: 8450,
  currency: "EUR",
  deliveryAddress: "12 Rue Lafayette, Paris, 75009, France",
  statusUrl: "https://parcelith.example/s/northwind/orders/ORD-7HQ4K2?t=abc",
};
const shipment = {
  customerName: "Priya Raman",
  code: "ORD-7HQ4K2",
  carrierName: "DHL",
  trackingNumber: "DHL8821640055",
  trackingUrl: "https://www.dhl.com/track?id=DHL8821640055",
  statusUrl: order.statusUrl,
};
const refund = { amount: 200, currency: "EUR", reason: "Late delivery" };
const orderUpdate = { customerName: "Priya Raman", code: "ORD-7HQ4K2", statusUrl: order.statusUrl };
const invite = {
  name: "Sam Okafor",
  inviterName: "Dana Whitfield",
  roleLabel: "Order manager",
  acceptUrl: "https://parcelith.example/invite/inv_9f2k",
};
const approval = {
  approverName: "Dana Whitfield",
  buyerName: "Leo Marchetti",
  campaignName: "Q4 client gifts",
  campaignCode: "CMP-4820",
  companyName: "Helio Labs",
  recipients: 48,
  total: 412000,
  currency: "EUR",
  approvalUrl: "https://parcelith.example/g/helio/c/CMP-4820?a=xyz",
};

function built(language) {
  const b = brandFor(store);
  const copy = emailCopyFor(language);
  return [
    { name: "order confirmation", email: orderConfirmationEmail(b, copy, order), link: order.statusUrl },
    { name: "shipping notification", email: shippingNotificationEmail(b, copy, shipment), link: shipment.trackingUrl },
    { name: "team invitation", email: teamInviteEmail(b, copy, invite), link: invite.acceptUrl },
    { name: "gift approval", email: giftApprovalEmail(b, copy, approval), link: approval.approvalUrl },
    { name: "refund issued", email: refundIssuedEmail(b, copy, { ...orderUpdate, refund }), link: order.statusUrl },
    { name: "order cancelled", email: orderCancelledEmail(b, copy, orderUpdate), link: order.statusUrl },
    {
      name: "order cancelled with refund",
      email: orderCancelledEmail(b, copy, { ...orderUpdate, refund }),
      link: order.statusUrl,
    },
    { name: "order delivered", email: orderDeliveredEmail(b, copy, orderUpdate), link: order.statusUrl },
  ];
}

for (const code of LOCALES) {
  for (const { name, email, link } of built(code)) {
    assert.ok(email.subject.length > 0, `${code} ${name} has no subject`);
    // The bug this exists for: a template shipped with "{code}" in the subject.
    assert.ok(!/\{\w+\}/.test(email.subject), `${code} ${name} subject has an unfilled placeholder`);
    assert.ok(!/\{\w+\}/.test(email.text), `${code} ${name} body has an unfilled placeholder`);
    assert.ok(email.html.includes(link), `${code} ${name} does not carry its link`);
    assert.ok(email.text.includes(link), `${code} ${name} text part does not carry its link`);
    // Branding: the logo and the merchant of record, on every message.
    assert.ok(email.html.includes(store.logoUrl), `${code} ${name} does not show the store logo`);
    assert.ok(email.text.includes("Northwind Supply"), `${code} ${name} does not name the store`);
    assert.ok(email.html.includes("Northwind Technologies"), `${code} ${name} omits the merchant of record`);
    assert.ok(email.html.includes("support@northwind.example"), `${code} ${name} omits the support address`);
  }
}

/* ------------------------------------------------ the store's own language */

const english = built("en");
const german = built("de");
for (let i = 0; i < english.length; i += 1) {
  assert.notEqual(
    german[i].email.subject,
    english[i].email.subject,
    `${english[i].name} is still English on a German store`,
  );
}
assert.ok(
  german[0].email.html.includes(shopperT("de", "email")("orderHeading")),
  "the order confirmation reads from the German messages",
);
// Money follows the store's language, like everything else on the storefront.
assert.ok(english[0].email.text.includes("€84.50"));
assert.ok(german[0].email.text.replace(/[  ]/g, " ").includes("84,50 €"));

// A refund email says how much, why, and when it reaches the card.
const refundText = english.find((e) => e.name === "refund issued").email.text;
assert.ok(refundText.includes("€2.00"), "the refund amount is in the email");
assert.ok(refundText.includes("Late delivery"), "the refund reason is in the email");
assert.ok(refundText.includes(shopperT("en", "email")("refundTiming")), "the refund email says when the money arrives");
const cancelledText = english.find((e) => e.name === "order cancelled").email.text;
assert.ok(!cancelledText.includes("€"), "a cancellation without a refund promises no money");
assert.ok(english.find((e) => e.name === "order cancelled with refund").email.text.includes("€2.00"));

/* ------------------------------------------------------- escaping and fallbacks */

const noLogo = orderConfirmationEmail(brandFor({ ...store, logoUrl: null }), emailCopyFor("en"), order);
assert.ok(noLogo.html.includes("Northwind Supply"), "a store with no logo falls back to its name");
assert.ok(!noLogo.html.includes("<img"));

const noSupport = orderConfirmationEmail(brandFor({ ...store, supportEmail: null }), emailCopyFor("en"), order);
assert.ok(!noSupport.html.includes("support@northwind.example"), "nothing invents a support address");

// A name or a campaign title with markup in it cannot break out of the message.
const injected = orderConfirmationEmail(brand, emailCopyFor("en"), {
  ...order,
  customerName: '<script>alert("x")</script>',
});
assert.ok(!injected.html.includes("<script>"), "names are escaped into the HTML part");
assert.ok(injected.html.includes("&lt;script&gt;"));

// A shipment with no carrier page still links the shopper back to their order.
const noTracking = shippingNotificationEmail(brand, emailCopyFor("en"), { ...shipment, trackingUrl: null });
assert.ok(noTracking.html.includes(shipment.statusUrl));

console.log("email-check: OK");

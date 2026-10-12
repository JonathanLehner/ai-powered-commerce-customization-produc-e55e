// Self-check for the pricing page's plan enquiry: npm run enquiry-check
import assert from "node:assert/strict";
import {
  checkEnquiry,
  planEnquiryLabel,
  planEnquirySentence,
  PLAN_ENQUIRY_CHOICES,
  UNDECIDED,
} from "../src/lib/enquiry.ts";
import { PLAN_CURRENCIES, PLAN_KEYS, PLANS, defaultPlanCurrency, planPrice } from "../src/lib/plans.ts";
import { createTranslator } from "next-intl";
import { LOCALES } from "../src/i18n/locales.ts";
import { enquiryAlertEmail, enquiryConfirmationEmail } from "../src/lib/enquiry-emails.ts";
import { emailCopyFor, read } from "./shopper-intl.mjs";

const filled = {
  name: "  Robin Vale ",
  email: " Robin@ValeAndCo.example ",
  company: " Vale & Co ",
  message: " Six client stores and two gifting programmes. ",
  plan: "studio",
  wantsCall: "on",
  submissionKey: "frm_abc123",
};

/* --------------------------------------------------- the plans on the page */

// Every plan the pricing page sells is a plan the form accepts, plus the
// honest "not sure yet" — a button pointing at a plan the form refused would
// drop the visitor on an error they cannot fix.
for (const key of PLAN_KEYS) {
  assert.ok(PLAN_ENQUIRY_CHOICES.includes(key), `the form does not accept the ${key} plan`);
  assert.equal(planEnquiryLabel(key), PLANS[key].name);
  assert.equal(planEnquirySentence(key), `the ${PLANS[key].name} plan`);
}
assert.ok(PLAN_ENQUIRY_CHOICES.includes(UNDECIDED));
assert.equal(planEnquiryLabel(UNDECIDED), "Undecided");
assert.equal(planEnquirySentence(UNDECIDED), "a plan we can recommend");
// A plan nobody sells is named without pretending to know it.
assert.equal(planEnquiryLabel("platinum"), "Undecided");

// German and the other EU languages show euros first; English and Japanese show
// US dollars. Every priced plan has a list price in each currency the switch offers.
assert.equal(defaultPlanCurrency("de"), "EUR");
assert.equal(defaultPlanCurrency("fr"), "EUR");
assert.equal(defaultPlanCurrency("en"), "USD");
assert.equal(defaultPlanCurrency("ja"), "USD");
for (const key of PLAN_KEYS) {
  for (const currency of PLAN_CURRENCIES) {
    const price = planPrice(PLANS[key], "monthly", currency);
    if (PLANS[key].prices === null) assert.equal(price, null);
    else assert.ok(price.perMonth > 0, `${key} has no ${currency} price`);
  }
}
// Round euro list prices, set per plan and cycle rather than converted from dollars.
assert.deepEqual(planPrice(PLANS.starter, "monthly", "EUR"), { perMonth: 39, billed: 39 });
assert.deepEqual(planPrice(PLANS.starter, "yearly", "EUR"), { perMonth: 31, billed: 374 });
assert.deepEqual(planPrice(PLANS.studio, "monthly", "EUR"), { perMonth: 149, billed: 149 });
assert.deepEqual(planPrice(PLANS.studio, "yearly", "EUR"), { perMonth: 119, billed: 1430 });
assert.deepEqual(planPrice(PLANS.starter, "monthly", "USD"), { perMonth: 39, billed: 39 });
assert.deepEqual(planPrice(PLANS.studio, "yearly", "USD"), { perMonth: 119, billed: 1430 });
assert.equal(planPrice(PLANS.scale, "yearly", "EUR"), null);

/* ------------------------------------------------------ what is refused */

const refusals = [
  [{ ...filled, name: " R " }, "name"],
  [{ ...filled, name: "" }, "name"],
  [{ ...filled, email: "robin@" }, "email"],
  [{ ...filled, email: "" }, "email"],
  [{ ...filled, company: "  " }, "company"],
  [{ ...filled, plan: "platinum" }, "plan"],
  [{ ...filled, plan: "" }, "plan"],
];
for (const [input, field] of refusals) {
  const result = checkEnquiry(input);
  assert.equal(result.ok, false, `${field} should have been refused`);
  assert.equal(result.field, field);
  assert.ok(result.message.length > 0, "a refusal always says what to correct");
}

/* --------------------------------------------------------- what is kept */

const accepted = checkEnquiry(filled);
assert.equal(accepted.ok, true);
assert.deepEqual(accepted.value, {
  name: "Robin Vale",
  email: "robin@valeandco.example",
  company: "Vale & Co",
  message: "Six client stores and two gifting programmes.",
  plan: "studio",
  currency: "USD",
  wantsCall: true,
  submissionKey: "frm_abc123",
});

// The currency the prices were shown in is kept, so the plan is billed in it.
// Anything the form could not have sent falls back to US dollars.
assert.equal(checkEnquiry({ ...filled, currency: "EUR" }).value.currency, "EUR");
assert.equal(checkEnquiry({ ...filled, currency: "eur" }).value.currency, "EUR");
assert.equal(checkEnquiry({ ...filled, currency: "GBP" }).value.currency, "USD");

// The message is the only long field, and it is clamped rather than refused:
// somebody pasting a brief should not lose the enquiry over it.
const long = checkEnquiry({ ...filled, message: "x".repeat(5000) });
assert.equal(long.ok, true);
assert.equal(long.value.message.length, 2000);

// The call-back box is a checkbox, so it arrives as "on" or not at all.
assert.equal(checkEnquiry({ ...filled, wantsCall: undefined }).value.wantsCall, false);
assert.equal(checkEnquiry({ ...filled, wantsCall: true }).value.wantsCall, true);

// No key means no de-duplication, which is allowed: the enquiry still lands.
assert.equal(checkEnquiry({ ...filled, submissionKey: "" }).value.submissionKey, "");

/* ------------------------------------------------------------ the emails */

// The visitor hears back in the language they wrote in, and the sales inbox gets
// everything needed to reply plus the link to the enquiry in platform admin.
const enquiry = { ...accepted.value, locale: "de" };
const adminUrl = "https://parcelith.example/admin/enquiries/enq_abc123";
const logoUrl = "https://parcelith.example/logo.png";
const t = (locale, namespace) => createTranslator({ locale, messages: read(locale), namespace });
const placeholder = /\{\w+\}/;

for (const code of LOCALES) {
  for (const plan of ["studio", UNDECIDED]) {
    const subject = { ...enquiry, plan, locale: code };
    const planName = planEnquiryLabel(plan);
    const confirmation = enquiryConfirmationEmail(emailCopyFor(code), t(code, "contact.email"), subject, planName, logoUrl);
    const alert = enquiryAlertEmail(emailCopyFor(code), t(code, "admin.enquiryEmail"), subject, planName, adminUrl, logoUrl);
    for (const [name, email] of [["confirmation", confirmation], ["alert", alert]]) {
      assert.ok(!placeholder.test(email.subject), `${code} ${name} subject has an unfilled placeholder`);
      assert.ok(!placeholder.test(email.text), `${code} ${name} body has an unfilled placeholder`);
      assert.ok(email.html.includes(`lang="${code}"`), `${code} ${name} is not marked as ${code}`);
      assert.ok(email.html.includes(logoUrl), `${code} ${name} does not show the logo`);
      assert.ok(email.text.includes("Vale & Co"), `${code} ${name} does not name the company`);
      assert.ok(email.text.includes(enquiry.message), `${code} ${name} does not repeat the message`);
      if (plan === "studio") assert.ok(email.text.includes("Studio"), `${code} ${name} does not name the plan`);
    }
    assert.ok(email(alert).includes(adminUrl), `${code} alert does not link to the enquiry`);
    assert.ok(alert.text.includes("robin@valeandco.example"), `${code} alert does not carry the reply address`);
    assert.ok(!confirmation.html.includes("/admin/"), `${code} confirmation links into platform admin`);
  }
}
function email(built) {
  return built.html + built.text;
}

const english = enquiryConfirmationEmail(emailCopyFor("en"), t("en", "contact.email"), enquiry, "Studio", logoUrl);
const german = enquiryConfirmationEmail(emailCopyFor("de"), t("de", "contact.email"), enquiry, "Studio", logoUrl);
assert.notEqual(german.subject, english.subject, "the confirmation is still English for a German visitor");
assert.ok(english.text.includes("Hello Robin,"), "the visitor is greeted by first name");
assert.ok(english.text.includes("the Studio plan and will call you within one business day"));

const markup = enquiryAlertEmail(emailCopyFor("en"), t("en", "admin.enquiryEmail"), { ...enquiry, company: "<b>x</b>" }, "Studio", adminUrl, null);
assert.ok(!markup.html.includes("<b>x</b>"), "visitor text is escaped into the alert");

console.log("enquiry-check: ok");

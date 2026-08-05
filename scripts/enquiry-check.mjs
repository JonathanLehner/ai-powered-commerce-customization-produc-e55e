// Self-check for the pricing page's plan enquiry: npm run enquiry-check
import assert from "node:assert/strict";
import {
  checkEnquiry,
  planEnquiryLabel,
  planEnquirySentence,
  PLAN_ENQUIRY_CHOICES,
  UNDECIDED,
} from "../src/lib/enquiry.ts";
import { PLAN_KEYS, PLANS } from "../src/lib/plans.ts";

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
  wantsCall: true,
  submissionKey: "frm_abc123",
});

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

console.log("enquiry-check: ok");

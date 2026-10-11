// Self-check for the self-serve sign-up form: npm run signup-check
import assert from "node:assert/strict";
import { checkSignup, isSelfServePlan } from "../src/lib/signup.ts";

const valid = {
  name: "Mara Lind",
  email: "  Mara@Studio-Lind.com ",
  agencyName: "Studio Lind",
  password: "correct horse",
  plan: "studio",
  cycle: "yearly",
  currency: "EUR",
  submissionKey: "sgn_abcdefghij12",
};

const ok = checkSignup(valid);
assert.ok(ok.ok);
assert.equal(ok.value.email, "mara@studio-lind.com", "email is trimmed and lower-cased");
assert.equal(ok.value.cycle, "yearly", "the pricing toggle's period is kept");
assert.equal(ok.value.currency, "EUR");

// Scale is sold by sales, never self-serve.
assert.equal(isSelfServePlan("scale"), false);
assert.deepEqual(checkSignup({ ...valid, plan: "scale" }), { ok: false, field: "plan" });

assert.deepEqual(checkSignup({ ...valid, name: " " }), { ok: false, field: "name" });
assert.deepEqual(checkSignup({ ...valid, email: "mara" }), { ok: false, field: "email" });
assert.deepEqual(checkSignup({ ...valid, agencyName: "" }), { ok: false, field: "agencyName" });
assert.deepEqual(checkSignup({ ...valid, password: "short" }), { ok: false, field: "password" });
assert.deepEqual(checkSignup({ ...valid, submissionKey: "" }), { ok: false, field: "form" });

// An unreadable period or currency falls back rather than failing the form.
const fallback = checkSignup({ ...valid, cycle: "weekly", currency: "GBP" });
assert.ok(fallback.ok);
assert.equal(fallback.value.cycle, "monthly");
assert.equal(fallback.value.currency, "USD");

console.log("signup-check ok");

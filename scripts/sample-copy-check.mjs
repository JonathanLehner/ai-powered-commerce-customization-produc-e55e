// Self-check for template sample copy and the shipping claims publish check: npm run sample-copy-check
import assert from "node:assert/strict";
import { getTemplate, TEMPLATES } from "../src/lib/templates/index.ts";
import { templateTree } from "../src/lib/templates/tree.ts";
import { isSampleField, sampleTreeFields, SAMPLE_PROP, withoutSample } from "../src/lib/sample-copy.ts";
import { claimedAmount, claimedDays, shippingClaimIssues, suggestedFreeRate } from "../src/lib/shipping-claims.ts";

const fieldDay = getTemplate("field-day");
assert.ok(fieldDay, "Field Day template exists");
const tree = templateTree(fieldDay, { sourceLocale: "en", locales: ["en"], brandName: "Test Store", now: Date.UTC(2026, 9, 15) });

// Applying Field Day flags its shipping claims, deadline, countdown and testimonials.
const flagged = sampleTreeFields(tree);
const values = flagged.map((f) => f.value);
for (const text of [
  "Summer offsite 2026",
  "Orders placed this week arrive before the offsite",
  "Delivered to the office in time for the offsite",
  "Office delivery",
  "Sent to your desk, free.",
  "Offsite orders close Friday at noon",
  "Free delivery to the office",
  "I wore the hoodie for three days straight. No regrets.",
  "Maya",
]) {
  assert.ok(values.includes(text), `flagged as sample: ${text}`);
}
const countdown = flagged.filter((f) => f.type === "Countdown").map((f) => f.field);
assert.ok(countdown.includes("endsAt"), "countdown date flagged");
assert.ok(countdown.includes("heading"), "countdown heading flagged");
// Ordinary copy is not flagged.
for (const text of ["Matching shirts are mandatory. Fun is encouraged.", "Soft and roomy", "Overheard at the offsite", "Team swag"]) {
  assert.ok(!values.includes(text), `not flagged: ${text}`);
}

// Editing a field clears its flag; clearing the record keeps the rest.
const block = tree.ROOT.props.productPage.find((b) => b.type === "ProductMain");
assert.equal(isSampleField(block.props, "trustNote"), true);
assert.equal(isSampleField({ ...block.props, trustNote: "Ships in 3 days" }, "trustNote"), false);
const features = tree.ROOT.props.productPage.find((b) => b.type === "ProductFeatures");
const rest = withoutSample(features.props, "feature2Title");
assert.ok(rest && "feature2Body" in rest && !("feature2Title" in rest));
assert.equal(withoutSample({ [SAMPLE_PROP]: { a: "x" }, a: "x" }, "a"), undefined);

// Every template builds, and every flag matches the value it was written with.
for (const template of TEMPLATES) {
  const built = templateTree(template, { sourceLocale: "de", locales: ["de", "en"] });
  for (const field of sampleTreeFields(built)) assert.ok(field.value !== "", `${template.id} ${field.key} has a value`);
}

// Amounts and delivery times read from copy.
assert.equal(claimedAmount("Free shipping over $75", "USD"), 7500);
assert.equal(claimedAmount("Free shipping on orders over €49.90", "EUR"), 4990);
assert.equal(claimedAmount("Free shipping over ¥5,000", "JPY"), 5000);
assert.equal(claimedAmount("Free delivery to the office", "USD"), null);
assert.equal(claimedDays("Delivered in 2-3 business days"), 3);
assert.equal(claimedDays("Next-day delivery"), 1);
assert.equal(claimedDays("Free delivery to the office"), null);

// The store's only rate: a $6 flat rate.
const flat = {
  id: "shz_1",
  storeId: "sto_1",
  name: "United States",
  countries: ["US"],
  currency: "USD",
  rates: [{ id: "shr_1", name: "Standard", kind: "flat", amount: 600, tiers: [], threshold: null, minDays: 3, maxDays: 7 }],
  createdAt: "",
  updatedAt: "",
};

const issues = shippingClaimIssues(tree, [flat], "USD");
const byText = Object.fromEntries(issues.map((i) => [i.text, i.problem]));
assert.deepEqual(byText["Free delivery to the office"], { kind: "free", zones: ["United States"] });
assert.deepEqual(byText["Sent to your desk, free."], undefined, "no shipping word in the sentence");
assert.deepEqual(byText["Office delivery"], { kind: "sample" });
assert.deepEqual(byText["Delivered to the office in time for the offsite"], { kind: "sample" });
assert.deepEqual(byText["Orders placed this week arrive before the offsite"], { kind: "sample" });
// The hero's dated eyebrow is sample copy but no shipping claim.
assert.equal(byText["Summer offsite 2026"], undefined);

// The assistant's announcement: free shipping over $75 with no matching rate.
const withAnnouncement = structuredClone(tree);
withAnnouncement.ROOT.props.announcement = "Free shipping over $75";
const announced = shippingClaimIssues(withAnnouncement, [flat], "USD").find((i) => i.key === "site:announcement");
assert.deepEqual(announced?.problem, { kind: "freeOver", threshold: 7500, zones: ["United States"] });

// The matching "Free over an amount" rate makes the claim true.
const suggested = suggestedFreeRate(flat, 7500, "USD");
assert.deepEqual(suggested, { kind: "free_over", amount: 600, threshold: 7500, minDays: 3, maxDays: 7 });
const withFreeOver = { ...flat, rates: [...flat.rates, { id: "shr_2", name: "Free over $75", tiers: [], ...suggested }] };
assert.equal(shippingClaimIssues(withAnnouncement, [withFreeOver], "USD").find((i) => i.key === "site:announcement"), undefined);
// A higher threshold than promised does not.
const higher = { ...flat, rates: [...flat.rates, { ...withFreeOver.rates[1], threshold: 10000 }] };
assert.equal(shippingClaimIssues(withAnnouncement, [higher], "USD").find((i) => i.key === "site:announcement")?.problem.kind, "freeOver");

// A store with no zones charges standard shipping: free claims do not hold.
assert.deepEqual(shippingClaimIssues(withAnnouncement, [], "USD").find((i) => i.key === "site:announcement")?.problem, {
  kind: "freeOver",
  threshold: 7500,
  zones: [],
});

// Delivery faster than any rate.
const fast = structuredClone(tree);
fast.ROOT.props.announcement2 = "Delivered in 2 days";
assert.deepEqual(shippingClaimIssues(fast, [flat], "USD").find((i) => i.key === "site:announcement2")?.problem, {
  kind: "days",
  days: 2,
  fastest: 7,
});
// Rewritten, a delivery line the store wrote itself is not flagged.
fast.ROOT.props.announcement2 = "Delivered in 5 to 7 days";
assert.equal(shippingClaimIssues(fast, [flat], "USD").find((i) => i.key === "site:announcement2"), undefined);

console.log(`sample-copy-check: ok (${flagged.length} sample fields in Field Day, ${issues.length} claims to review)`);

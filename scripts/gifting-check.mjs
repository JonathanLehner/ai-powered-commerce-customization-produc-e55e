// Self-check for corporate gifting: npm run gifting-check
import assert from "node:assert/strict";
import { parseRecipients, sizesFor, splitRow } from "../src/lib/gift-recipients.ts";
import {
  campaignToken,
  catalogueToken,
  giftAccessCookie,
  verifyCampaignToken,
  verifyCatalogueToken,
} from "../src/lib/gift-access.ts";
import {
  APPROVAL_RESEND_GAP_MS,
  approvalLastSentAt,
  approvalRequestedAt,
  approvalResendCheck,
  approvalWaitLabel,
  approverChangeCheck,
  approverLabel,
  daysAwaitingApproval,
  isApprovalStale,
} from "../src/lib/gift-approval.ts";

/* ------------------------------------------------------------ the products */

const tee = {
  id: "prd_tee",
  name: "Northwind Everyday Tee",
  sku: "NORTHW-EVE-TEE",
  currency: "USD",
  variants: [
    { id: "v_s", name: "White / S", size: "S", colour: "White", price: 3200, enabled: true, availability: "in_stock" },
    { id: "v_m", name: "White / M", size: "M", colour: "White", price: 3200, enabled: true, availability: "in_stock" },
    { id: "v_l", name: "White / L", size: "L", colour: "White", price: 3200, enabled: true, availability: "low_stock" },
    { id: "v_xl", name: "White / XL", size: "XL", colour: "White", price: 3400, enabled: true, availability: "out_of_stock" },
    { id: "v_2xl", name: "White / 2XL", size: "2XL", colour: "White", price: 3400, enabled: false, availability: "in_stock" },
  ],
};
const mug = {
  id: "prd_mug",
  name: "Northwind Enamel Mug",
  sku: "NORTHW-ENA-MUG",
  currency: "USD",
  variants: [
    { id: "v_mug", name: "White", size: "", colour: "White", price: 2400, enabled: true, availability: "in_stock" },
  ],
};

// A mug is sold in one named size, which is not something a buyer can get wrong.
const tumbler = {
  id: "prd_tumbler",
  name: "Northwind Tumbler",
  sku: "NORTHW-TUM",
  currency: "USD",
  variants: [
    { id: "v_15", name: "15oz", size: "15oz", colour: "Black", price: 2600, enabled: true, availability: "in_stock" },
  ],
};

const options = {
  products: [tee, mug, tumbler],
  defaultProductId: tee.id,
  currency: "USD",
  spendLimit: 7500,
};

assert.deepEqual(sizesFor(tee), ["S", "M", "L", "XL"], "a disabled variant is not an orderable size");
assert.deepEqual(sizesFor(mug), [], "one-size products have no size column to fill in");
assert.deepEqual(sizesFor(tumbler), ["15oz"]);

// A size typed for a product that only comes one way is ignored rather than
// rejected: a list has one size column and it is filled in for the apparel.
const oneSize = parseRecipients(
  "Jo Ray,jo@northwind.example,9 Mill Lane,Bath,BA1 1AA,GB,M,1,Northwind Tumbler",
  { products: [tee, mug, tumbler], defaultProductId: "prd_tee", currency: "USD", spendLimit: 7500 },
);
assert.deepEqual(oneSize.rows[0].issues, []);
assert.equal(oneSize.rows[0].variantId, "v_15");

/* ------------------------------------------------------------ reading rows */

// A spreadsheet export: header row, the column names people actually type, a
// country by name and a quoted address containing a comma.
const exported = `Full Name,Work Email,Street Address,Town,Zip Code,Country,Garment Size,Qty,Gift,Message
Dana Whitfield,dana@northwind.example,"14 Bridge Street, Flat 2",Leeds,LS1 4AP,United Kingdom,m,1,,Welcome aboard
Arun Patel,arun@northwind.example,900 Market Street,San Francisco,94103,US,L,2,Northwind Enamel Mug,`;

const spreadsheet = parseRecipients(exported, options);
assert.equal(spreadsheet.rows.length, 2);

const [dana, arun] = spreadsheet.rows;
assert.deepEqual(
  [dana.name, dana.email, dana.line1, dana.city, dana.postalCode, dana.country],
  ["Dana Whitfield", "dana@northwind.example", "14 Bridge Street, Flat 2", "Leeds", "LS1 4AP", "GB"],
);
assert.deepEqual(dana.issues, [], "a complete row has nothing to fix");
assert.equal(dana.variantId, "v_m", "a lower-case size still resolves");
assert.equal(dana.storeProductId, tee.id, "an empty product column falls back to the chosen gift");
assert.equal(dana.lineTotal, 3200);
assert.equal(dana.note, "Welcome aboard");

// The product column names a different gift, and the quantity column is read.
assert.equal(arun.storeProductId, mug.id);
assert.equal(arun.quantity, 2);
assert.equal(arun.lineTotal, 4800);
assert.deepEqual(arun.issues, [], "a mug needs no size");

// Rows can also arrive with no header at all, in the documented order.
const positional = parseRecipients(
  "Mira Sokolov,mira@northwind.example,4 Kirkgate,York,YO1 8BG,GB,S,1",
  options,
);
assert.equal(positional.rows.length, 1);
assert.deepEqual(positional.rows[0].issues, []);
assert.equal(positional.rows[0].variantId, "v_s");

// Tabs from a pasted spreadsheet selection work like commas.
const tabbed = parseRecipients(
  "name\temail\taddress\tcity\tpostcode\tcountry\tsize\nJo Ray\tjo@northwind.example\t9 Mill Lane\tBath\tBA1 1AA\tGB\tM",
  options,
);
assert.equal(tabbed.rows.length, 1);
assert.deepEqual(tabbed.rows[0].issues, []);

assert.deepEqual(splitRow('a,"b,c",d', ","), ["a", "b,c", "d"]);
assert.deepEqual(splitRow('"say ""hi""",x', ","), ['say "hi"', "x"]);

/* --------------------------------------------------------- what is refused */

const broken = parseRecipients(
  [
    "name,email,address,city,postcode,country,size,quantity,product",
    "Al,not-an-email,3 Short Row,Hull,HU1 1AA,GB,M,1,",
    "Bo Chen,bo@northwind.example,12 Long Road,Nowhere,00000,Atlantis,M,1,",
    "Cass Lee,cass@northwind.example,7 High Street,Leeds,LS1 4AP,GB,XXL,1,",
    "Dev Rao,dev@northwind.example,8 High Street,Leeds,LS1 4AP,GB,XL,1,",
    "Eve Ito,eve@northwind.example,9 High Street,Leeds,LS1 4AP,GB,,1,",
    "Fay Ng,fay@northwind.example,10 High Street,Leeds,LS1 4AP,GB,M,1,Novelty Socks",
    "Gil Sun,gil@northwind.example,11 High Street,Leeds,LS1 4AP,GB,M,3,",
  ].join("\n"),
  options,
);
const issueFor = (name) => broken.rows.find((row) => row.name === name).issues.join(" ");

assert.match(issueFor("Al"), /valid email/);
assert.match(issueFor("Bo Chen"), /not a country/);
assert.match(issueFor("Cass Lee"), /not a size/);
assert.match(issueFor("Dev Rao"), /out of stock/, "XL exists but cannot be produced");
assert.match(issueFor("Eve Ito"), /Add a size/, "apparel needs a size, and the row says which are available");
assert.match(issueFor("Fay Ng"), /not in this gift catalogue/);
// 3 × $32.00 is $96.00 against a $75.00 limit.
assert.match(issueFor("Gil Sun"), /Over the spend limit/);

// A row over the limit is still returned, so the buyer can see which one to fix.
assert.equal(broken.rows.length, 7);

// No limit set means no limit enforced.
const unlimited = parseRecipients(
  "Gil Sun,gil@northwind.example,11 High Street,Leeds,LS1 4AP,GB,M,3",
  { ...options, spendLimit: 0 },
);
assert.deepEqual(unlimited.rows[0].issues, []);

// Quantities are capped per recipient, and the cap is stated rather than silent.
const greedy = parseRecipients(
  "Gil Sun,gil@northwind.example,11 High Street,Leeds,LS1 4AP,GB,M,99",
  { ...options, spendLimit: 0, maxQuantity: 10 },
);
assert.equal(greedy.rows[0].quantity, 10);
assert.match(greedy.rows[0].issues.join(" "), /capped at 10/);

// Blank lines and comments are skipped; rows past the cap are reported, never
// silently dropped.
const long = [
  "# our December list",
  "",
  ...Array.from(
    { length: 5 },
    (_, i) => `Person ${i},p${i}@northwind.example,${i} High Street,Leeds,LS1 4AP,GB,M,1`,
  ),
].join("\n");
const capped = parseRecipients(long, { ...options, maxRecipients: 3 });
assert.equal(capped.rows.length, 3);
assert.equal(capped.overflow, 2);

// Prices are converted into the campaign's currency before the limit is applied.
const inEuros = parseRecipients(
  "Jo Ray,jo@northwind.example,9 Mill Lane,Bath,BA1 1AA,GB,M,1",
  { ...options, currency: "EUR" },
);
assert.equal(inEuros.rows[0].unitPrice, 2963, "$32.00 at the platform's EUR rate");

/* --------------------------------------------------------------- the locks */

const catalogue = { id: "gft_1", accessSecret: "sec_one" };
const rotated = { id: "gft_1", accessSecret: "sec_two" };

const link = await catalogueToken(catalogue);
assert.equal(await verifyCatalogueToken(catalogue, link), true);
assert.equal(await verifyCatalogueToken(catalogue, undefined), false);
assert.equal(await verifyCatalogueToken(catalogue, link.slice(0, -1)), false);
assert.equal(await verifyCatalogueToken({ id: "gft_2", accessSecret: "sec_one" }, link), false);
// Regenerating the link closes every copy already handed out.
assert.equal(await verifyCatalogueToken(rotated, link), false);

const cookie = await giftAccessCookie(
  { ...catalogue, invitedEmails: [], access: "invite", storeId: "str_1" },
  "buyer@northwind.example",
);
assert.equal(cookie.name, "cc_gift_gft_1");
assert.equal(cookie.options.httpOnly, true);
assert.ok(cookie.value.startsWith("buyer@northwind.example|"));
const other = await giftAccessCookie(
  { ...catalogue, invitedEmails: [], access: "invite", storeId: "str_1" },
  "someone@else.example",
);
assert.notEqual(cookie.value.split("|")[1], other.value.split("|")[1], "one address cannot use another's token");

// The buyer link cannot approve, and the approver link is not the buyer's.
const buyer = await campaignToken("cmp_1", "buyer");
const approver = await campaignToken("cmp_1", "approver");
assert.notEqual(buyer, approver);
assert.equal(await verifyCampaignToken("cmp_1", "buyer", buyer), true);
assert.equal(await verifyCampaignToken("cmp_1", "approver", buyer), false);
assert.equal(await verifyCampaignToken("cmp_2", "buyer", buyer), false);
assert.equal(await verifyCampaignToken("cmp_1", "buyer", undefined), false);

/* ------------------------------------------- a campaign stuck at approval */

const NOW = new Date("2026-09-10T09:00:00.000Z");
const waiting = {
  code: "CMP-51740",
  status: "awaiting_approval",
  createdAt: "2026-09-06T08:00:00.000Z",
  approval: {
    required: true,
    approverName: "Dana Whitfield",
    approverEmail: "dana@northwind.example",
    requestedAt: null,
    lastRequestedAt: null,
    remindersSent: 0,
    decidedBy: null,
    decidedAt: null,
    note: null,
  },
};

// A campaign written before the panel existed has been waiting since the buyer
// submitted it, which is the only instant recorded for it.
assert.equal(approvalRequestedAt(waiting), waiting.createdAt);
assert.equal(approvalLastSentAt(waiting), waiting.createdAt);
assert.equal(daysAwaitingApproval(waiting, NOW), 4);
assert.equal(approvalWaitLabel(4), "Waiting 4 days");
assert.equal(approvalWaitLabel(1), "Waiting 1 day");
assert.equal(approvalWaitLabel(0), "Sent today");
assert.equal(isApprovalStale(waiting, NOW), false);
assert.equal(isApprovalStale(waiting, new Date("2026-09-13T09:00:00.000Z")), true);
assert.equal(approverLabel(waiting), "Dana Whitfield (dana@northwind.example)");

assert.equal(approvalResendCheck(waiting, NOW).ok, true);

// A double click, or a retried submission, must not record the chase twice.
const justChased = {
  ...waiting,
  approval: { ...waiting.approval, lastRequestedAt: new Date(NOW.getTime() - 5000).toISOString() },
};
const repeat = approvalResendCheck(justChased, NOW);
assert.equal(repeat.ok, false);
assert.equal(repeat.duplicate, true);
// Once the gap has passed it is a fresh chase rather than the same one.
assert.equal(
  approvalResendCheck(justChased, new Date(NOW.getTime() + APPROVAL_RESEND_GAP_MS)).ok,
  true,
);

// Nothing to chase on a campaign that has been decided, or never needed one.
assert.equal(approvalResendCheck({ ...waiting, status: "approved" }, NOW).ok, false);
assert.equal(
  approvalResendCheck({ ...waiting, approval: { ...waiting.approval, required: false } }, NOW).ok,
  false,
);

// Handing the campaign to somebody reachable.
assert.equal(approverChangeCheck(waiting, { name: "Sam Okafor", email: "sam@northwind.example" }).ok, true);
assert.equal(approverChangeCheck(waiting, { name: "S", email: "sam@northwind.example" }).ok, false);
assert.equal(approverChangeCheck(waiting, { name: "Sam Okafor", email: "sam@northwind" }).ok, false);
const noop = approverChangeCheck(waiting, { name: "Dana Whitfield", email: "DANA@northwind.example" });
assert.equal(noop.ok, false);
assert.equal(noop.duplicate, true, "naming the same person again changes nothing");
// An approved campaign is not stuck, so its approver is history rather than a
// setting.
assert.equal(
  approverChangeCheck({ ...waiting, status: "approved" }, { name: "Sam Okafor", email: "sam@northwind.example" }).ok,
  false,
);

console.log("gifting-check ok");

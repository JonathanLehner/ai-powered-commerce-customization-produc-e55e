// Self-check for store team notifications: npm run notifications-check
//
// A notification names a store and links into it, so it must only ever reach
// someone on that store's team, and stop showing once they leave it. New-order
// emails are batched: at most one per person and store each hour, and every
// order still reaches the inbox once.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LOCALES } from "../src/i18n/locales.ts";
import {
  DEFAULT_NOTIFICATION_PREFS,
  DIGEST_WINDOW_MS,
  NOTIFICATION_TYPES,
  digestBatch,
  digestDue,
  isDigestType,
  notificationRecipients,
  notificationTitleKey,
  resolvePrefs,
  visibleNotifications,
} from "../src/lib/notifications.ts";

/* ------------------------------------------------------------- recipients */

const store = { id: "str_rivet", agencyId: "agc_cobalt" };

const cobaltAdmin = { id: "usr_mira", platformRole: "agency_admin", agencyId: "agc_cobalt" };
const otherAdmin = { id: "usr_lars", platformRole: "agency_admin", agencyId: "agc_northlight" };
const platformAdmin = { id: "usr_priya", platformRole: "platform_admin", agencyId: null };
const member = { id: "usr_ines", platformRole: "agency_member", agencyId: "agc_northlight" };
const invited = { id: "usr_ola", platformRole: "agency_member", agencyId: "agc_cobalt" };
const elsewhere = { id: "usr_sam", platformRole: "agency_member", agencyId: "agc_cobalt" };
const actor = { id: "usr_dana", platformRole: "agency_member", agencyId: "agc_cobalt" };

const memberships = [
  { userId: member.id, storeId: store.id, role: "order_manager", status: "active" },
  { userId: invited.id, storeId: store.id, role: "viewer", status: "invited" },
  { userId: elsewhere.id, storeId: "str_ferro", role: "store_admin", status: "active" },
  { userId: actor.id, storeId: store.id, role: "store_admin", status: "active" },
];

const recipients = notificationRecipients(
  store,
  [cobaltAdmin, otherAdmin, platformAdmin, member, invited, elsewhere, actor, cobaltAdmin],
  memberships,
  actor.id,
).map((u) => u.id);

assert.deepEqual(recipients, [cobaltAdmin.id, member.id], "the agency admin and the active member, once each");
assert.ok(!recipients.includes(otherAdmin.id), "another agency's admin cannot open the store");
assert.ok(!recipients.includes(platformAdmin.id), "platform oversight is not team membership");
assert.ok(!recipients.includes(invited.id), "an invitation not yet accepted grants nothing");
assert.ok(!recipients.includes(elsewhere.id), "a membership in another store grants nothing here");
assert.ok(!recipients.includes(actor.id), "nobody is notified of their own action");

// A shopper or the system caused it: the whole team hears.
const all = notificationRecipients(store, [cobaltAdmin, member, actor], memberships, "system").map((u) => u.id);
assert.deepEqual(all, [cobaltAdmin.id, member.id, actor.id]);

/* ------------------------------------------------------ reading the bell */

const feed = [
  { id: "n1", storeId: "str_rivet", inApp: true },
  { id: "n2", storeId: "str_ferro", inApp: true },
  { id: "n3", storeId: "str_rivet", inApp: false },
];
assert.deepEqual(
  visibleNotifications(feed, ["str_rivet"]).map((n) => n.id),
  ["n1"],
  "a store the reader has since left is hidden, and email-only rows never show in the bell",
);
assert.deepEqual(visibleNotifications(feed, []), [], "no stores, nothing at all");

/* ------------------------------------------------------------ preferences */

assert.deepEqual(DEFAULT_NOTIFICATION_PREFS.order_paid, { inApp: true, email: false }, "new orders: in-app only");
assert.deepEqual(DEFAULT_NOTIFICATION_PREFS.order_exception, { inApp: true, email: true }, "exceptions: both");
assert.deepEqual(DEFAULT_NOTIFICATION_PREFS.gift_approval, { inApp: true, email: true }, "approvals: both");
for (const type of NOTIFICATION_TYPES) assert.ok(DEFAULT_NOTIFICATION_PREFS[type], `${type} has a default`);

const saved = resolvePrefs({
  order_paid: { inApp: false, email: true },
  refund_recorded: { inApp: "yes", email: true },
  bogus: { inApp: true, email: true },
});
assert.deepEqual(saved.order_paid, { inApp: false, email: true }, "a saved choice wins");
assert.deepEqual(saved.refund_recorded, DEFAULT_NOTIFICATION_PREFS.refund_recorded, "a malformed one is ignored");
assert.equal("bogus" in saved, false);
assert.deepEqual(resolvePrefs(undefined), DEFAULT_NOTIFICATION_PREFS);

assert.equal(notificationTitleKey("order_paid", { code: "ORD-1" }), "order_paid");
assert.equal(notificationTitleKey("order_paid", { code: "GFT-1", count: 4 }), "campaignPaid");

/* ---------------------------------------------------------------- digests */

assert.equal(isDigestType("order_paid"), true);
for (const type of NOTIFICATION_TYPES.filter((t) => t !== "order_paid")) {
  assert.equal(isDigestType(type), false, `${type} is emailed on its own`);
}

const t0 = Date.parse("2026-10-11T09:00:00.000Z");
const at = (minutes) => new Date(t0 + minutes * 60_000).toISOString();

assert.equal(digestDue(null, at(0)), true, "the first digest goes out straight away");
assert.equal(digestDue(at(0), at(59)), false);
assert.equal(digestDue(at(0), at(60)), true, "exactly an hour later it may go again");

/**
 * The same steps `lib/notify.ts` takes for one person and store: write the
 * notification as pending, then send a digest of everything unread that is
 * pending if the hour since the last one has passed.
 */
function simulate(events) {
  const rows = [];
  const sent = [];
  let lastSentAt = null;
  const flush = (now) => {
    const { send, skip } = digestBatch(rows);
    for (const row of skip) row.email = "skipped";
    if (send.length === 0 || !digestDue(lastSentAt, now)) return;
    lastSentAt = now;
    for (const row of send) row.email = "sent";
    sent.push({ at: now, codes: send.map((n) => n.params.code) });
  };
  for (const event of events) {
    if (event.order) {
      rows.push({ id: event.order, email: "pending", readAt: null, createdAt: event.at, params: { code: event.order } });
    }
    if (event.read) rows.find((n) => n.id === event.read).readAt = event.at;
    flush(event.at);
  }
  return { rows, sent };
}

const busy = simulate([
  { at: at(0), order: "ORD-1" },
  { at: at(5), order: "ORD-2" },
  { at: at(20), order: "ORD-3" },
  { at: at(59), order: "ORD-4" },
  { at: at(61), order: "ORD-5" },
  { at: at(70), order: "ORD-6" },
  { at: at(200), order: "ORD-7" },
]);
assert.deepEqual(busy.sent, [
  { at: at(0), codes: ["ORD-1"] },
  { at: at(61), codes: ["ORD-2", "ORD-3", "ORD-4", "ORD-5"] },
  { at: at(200), codes: ["ORD-6", "ORD-7"] },
]);
for (let i = 1; i < busy.sent.length; i++) {
  const gap = Date.parse(busy.sent[i].at) - Date.parse(busy.sent[i - 1].at);
  assert.ok(gap >= DIGEST_WINDOW_MS, "never two digests inside an hour for the same store");
}
const emailed = busy.sent.flatMap((s) => s.codes);
assert.equal(new Set(emailed).size, emailed.length, "no order is emailed twice");
assert.equal(emailed.length, 7, "every order reaches the inbox once");

// An order read in the app before its digest goes out is not emailed again.
const read = simulate([
  { at: at(0), order: "ORD-1" },
  { at: at(10), order: "ORD-2" },
  { at: at(30), read: "ORD-2" },
  { at: at(65), order: "ORD-3" },
]);
assert.deepEqual(read.sent.map((s) => s.codes), [["ORD-1"], ["ORD-3"]]);
assert.equal(read.rows.find((n) => n.id === "ORD-2").email, "skipped");

/* ------------------------------------------- wired where the audit is written */

// Payment confirmation is shared by checkout and the Stripe webhook, so it
// raises its notification from lib rather than from an action. The workspace
// and the Admin API share the store operations, so those raise theirs too.
const sources = [
  ...["orders", "shop", "gifting", "sourcing", "team"].map((name) => `../src/app/actions/${name}.ts`),
  ...["orders", "gifting", "sourcing", "team", "admin"].map((name) => `../src/lib/operations/${name}.ts`),
  "../src/lib/order-payment.ts",
  "../src/lib/gift-payment.ts",
  "../src/lib/inventory.ts",
  "../src/lib/webhooks.ts",
  "../src/lib/preflight-guard.ts",
]
  .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
  .join("\n");
for (const type of NOTIFICATION_TYPES) {
  assert.match(sources, new RegExp(`notify:[\\s\\S]{0,120}type: "${type}"`), `${type} is raised from a recordAudit call`);
}
const data = readFileSync(new URL("../src/lib/data.ts", import.meta.url), "utf8");
assert.match(data, /notifyFromAudit\(entry, input\.notify/, "recordAudit is what writes notifications");

/* ------------------------------------------------------------------ copy */

for (const locale of LOCALES) {
  const messages = JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
  const n = messages.notifications;
  for (const type of NOTIFICATION_TYPES) {
    assert.ok(n.titles[type], `${locale}: titles.${type}`);
    assert.ok(n.settings.types[type], `${locale}: settings.types.${type}`);
  }
  assert.ok(n.titles.campaignPaid, `${locale}: titles.campaignPaid`);
  for (const value of JSON.stringify(n).match(/"[^"]*"/g)) {
    assert.ok(!value.includes("—"), `${locale}: no em dashes in notification copy`);
  }
}

console.log("notifications-check: access filtering, preferences and digest batching hold");

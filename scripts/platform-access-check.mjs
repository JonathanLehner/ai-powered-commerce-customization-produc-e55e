// Self-check for what a platform administrator holds over a store: npm run platform-access-check
import assert from "node:assert/strict";
import { platformAuditEntry, PLATFORM_AUDIT_ACTOR } from "../src/lib/audit-log.ts";
import { resolveStoreRole, roleCan } from "../src/lib/store-access.ts";
import { storeAccessLabel } from "../src/lib/types.ts";

const store = { id: "str_rivet", agencyId: "agc_cobalt" };
const otherStore = { id: "str_ferro", agencyId: "agc_northlight" };

const platformAdmin = { id: "usr_priya", platformRole: "platform_admin", agencyId: null };
const cobaltAdmin = { id: "usr_mira", platformRole: "agency_admin", agencyId: "agc_cobalt" };
const invitedManager = { id: "usr_ines", platformRole: "agency_member", agencyId: "agc_northlight" };

const membership = { storeId: "str_ferro", role: "order_manager", status: "active" };

/* ------------------------------------------- oversight, never a membership */

const platform = resolveStoreRole(platformAdmin, store, []);
assert.deepEqual(platform, { role: "viewer", viaAgency: false, viaPlatform: true });
// The badge has to say what it is. "Store administrator" would be a lie: the
// platform admin holds no membership in this store.
assert.equal(storeAccessLabel(platform.role, platform.viaPlatform), "Platform access");
assert.equal(roleCan(platform.role, "store.view"), true);
for (const capability of ["store.settings", "store.team", "store.catalog", "store.orders", "store.storefront", "store.gifting"]) {
  assert.equal(roleCan(platform.role, capability), false, `platform access must not include ${capability}`);
}

/* ------------------------------------- the agency that runs the store, and its team */

const owner = resolveStoreRole(cobaltAdmin, store, []);
assert.deepEqual(owner, { role: "store_admin", viaAgency: true, viaPlatform: false });
assert.equal(storeAccessLabel(owner.role, owner.viaPlatform), "Store administrator");

// An agency administrator reaches its own stores only.
assert.equal(resolveStoreRole(cobaltAdmin, otherStore, []), null);

const invited = resolveStoreRole(invitedManager, otherStore, [membership]);
assert.deepEqual(invited, { role: "order_manager", viaAgency: false, viaPlatform: false });
assert.equal(storeAccessLabel(invited.role, invited.viaPlatform), "Order manager");
assert.equal(roleCan(invited.role, "store.orders"), true);

// An invitation that was never accepted is not access.
assert.equal(resolveStoreRole(invitedManager, otherStore, [{ ...membership, status: "invited" }]), null);
assert.equal(resolveStoreRole(invitedManager, store, [membership]), null);

/* ----------------------------------- what the audit trail says under platform access */

const campaign = {
  id: "aud_1",
  category: "gifting",
  action: "gifting.campaign_created",
  summary: "Rowan Ellis submitted gift campaign CMP-51740 “December client thank-yous” — 4 recipients",
  storeId: "str_northwind",
  agencyId: "agc_northlight",
  actorId: "gifting",
  actorName: "Rowan Ellis",
  entity: "gift_campaign",
  entityId: "CMP-51740",
  meta: { recipients: 4, total: 13596, currency: "USD" },
  at: "2026-09-06T10:05:00.000Z",
};

const readable = platformAuditEntry(campaign);
// The shopper's name is in the summary, in the actor column and nowhere else
// platform access may read it. The count of recipients is operational and stays.
assert.equal(readable.summary, "Gift campaign CMP-51740 submitted");
assert.equal(readable.actorName, PLATFORM_AUDIT_ACTOR);
assert.deepEqual(readable.meta, { recipients: 4 });
assert.ok(!JSON.stringify(readable).includes("Rowan Ellis"));
assert.ok(!JSON.stringify(readable).includes("13596"));
// The original is untouched, so the store team still reads its own history.
assert.equal(campaign.actorName, "Rowan Ellis");

const refund = {
  ...campaign,
  id: "aud_2",
  category: "order_routing",
  action: "order.refunded",
  summary: "Refunded $32.00 on ORD-52662567 — damaged in transit",
  actorId: "usr_ines",
  actorName: "Inés Duarte",
  entity: "order",
  entityId: "ORD-52662567",
  meta: { amount: 3200, reason: "damaged in transit" },
};
const readableRefund = platformAuditEntry(refund);
assert.equal(readableRefund.summary, "Refund recorded on ORD-52662567");
// Who did it is exactly what platform access is for: they operate the store.
assert.equal(readableRefund.actorName, "Inés Duarte");
assert.deepEqual(readableRefund.meta, { reason: "damaged in transit" });

// Chasing an approver and handing the campaign to somebody else are the store
// team's own actions, so who did them stays — but the approver is a named
// person at the client company, and platform access is not owed their name.
const chased = {
  ...campaign,
  id: "aud_chase",
  action: "gifting.approval_resent",
  summary: "Sent the approval request for gift campaign CMP-51740 to Dana Whitfield (dana@northwind.example) again",
  actorId: "usr_ines",
  actorName: "Inés Duarte",
  meta: { approver: "Dana Whitfield (dana@northwind.example)", waitingDays: 4, reminders: 1 },
};
const readableChase = platformAuditEntry(chased);
assert.equal(readableChase.summary, "Approval request for gift campaign CMP-51740 sent again");
assert.equal(readableChase.actorName, "Inés Duarte");
assert.deepEqual(readableChase.meta, { waitingDays: 4, reminders: 1 });
assert.ok(!JSON.stringify(readableChase).includes("Dana"));

const moved = {
  ...chased,
  id: "aud_moved",
  action: "gifting.approver_changed",
  summary: "Moved approval of gift campaign CMP-51740 from Dana Whitfield to Sam Okafor",
  meta: { from: "Dana Whitfield", to: "Sam Okafor (sam@northwind.example)", reason: "Dana has left" },
};
const readableMove = platformAuditEntry(moved);
assert.equal(readableMove.summary, "Approver changed on gift campaign CMP-51740");
assert.deepEqual(readableMove.meta, {});
assert.ok(!JSON.stringify(readableMove).includes("Okafor"));

// A store team's own configuration history reads as recorded.
const published = {
  ...campaign,
  id: "aud_3",
  category: "publishing",
  action: "storefront.published",
  summary: "Published storefront layout “Autumn range”",
  actorId: "usr_alex",
  actorName: "Alex Moreau",
  entity: "storefront",
  entityId: "str_northwind",
  meta: { sections: 7 },
};
assert.equal(platformAuditEntry(published), published);

console.log("platform-access-check: ok");

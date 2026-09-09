// Self-check for what a platform administrator holds over a store: npm run platform-access-check
import assert from "node:assert/strict";
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

console.log("platform-access-check: ok");

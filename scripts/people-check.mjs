// Self-check for the agency People grid: npm run people-check
import assert from "node:assert/strict";
import { chosenRoles, peopleGrid } from "../src/lib/people.ts";

const stores = [
  { id: "str_a", agencyId: "agc_cobalt", name: "A" },
  { id: "str_b", agencyId: "agc_cobalt", name: "B" },
];
const users = [
  { id: "usr_mira", email: "Mira@cobalt.test", name: "Mira", platformRole: "agency_admin", agencyId: "agc_cobalt" },
  { id: "usr_other", email: "o@north.test", name: "Other", platformRole: "agency_admin", agencyId: "agc_north" },
];
const m = (id, storeId, email, role, status = "active") => ({ id, storeId, email, name: email.split("@")[0], role, status });
const memberships = [
  m("mem_1", "str_a", "sam@client.test", "catalog_manager"),
  m("mem_2", "str_b", "SAM@client.test", "viewer", "invited"),
  m("mem_3", "str_x", "sam@client.test", "store_admin"),
  m("mem_4", "str_a", "mira@cobalt.test", "viewer"),
];

const rows = peopleGrid("agc_cobalt", users, memberships, stores);
// The agency's own admin first, other agencies' admins never.
assert.deepEqual(rows.map((r) => [r.email, r.agencyAdmin]), [["mira@cobalt.test", true], ["sam@client.test", false]]);
// One row per person across stores, each store keeping its own role.
assert.deepEqual(rows[1].cells, {
  str_a: { membershipId: "mem_1", role: "catalog_manager", status: "active" },
  str_b: { membershipId: "mem_2", role: "viewer", status: "invited" },
});
// A store outside the agency never shows.
assert.equal(rows[1].cells.str_x, undefined);

const form = new FormData();
form.set("role.str_a", "order_manager");
form.set("role.str_b", "none");
form.set("role.str_x", "store_admin");
form.set("role.str_c", "owner");
assert.deepEqual([...chosenRoles(form, new Set(["str_a", "str_b", "str_c"]))], [["str_a", "order_manager"]]);

console.log("people-check ok");

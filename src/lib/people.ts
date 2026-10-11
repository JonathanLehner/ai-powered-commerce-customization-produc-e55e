/**
 * The agency's People grid: everyone who can reach one of its stores, and how.
 *
 * Kept free of request state so it can be checked by `npm run people-check`.
 * Roles stay per store; nothing here grants access, it only reads memberships.
 */
import type { Membership, Store, StoreRole, User } from "./types";

export const STORE_ROLES: StoreRole[] = ["store_admin", "catalog_manager", "order_manager", "viewer"];

export interface PersonCell {
  membershipId: string;
  role: StoreRole;
  status: Membership["status"];
}

export interface PersonRow {
  /** Lower-cased email: one row per person, however many stores they are on. */
  email: string;
  name: string;
  /** Agency administrators reach every store through the agency itself. */
  agencyAdmin: boolean;
  cells: Record<string, PersonCell>;
}

/**
 * One row per agency administrator, then one per invited person, each with a
 * cell for every store they hold a membership in. Memberships in stores outside
 * `stores` are ignored, so another agency's grants never show here.
 */
export function peopleGrid(agencyId: string, users: User[], memberships: Membership[], stores: Store[]): PersonRow[] {
  const storeIds = new Set(stores.filter((s) => s.agencyId === agencyId).map((s) => s.id));
  const admins: PersonRow[] = users
    .filter((u) => u.platformRole === "agency_admin" && u.agencyId === agencyId)
    .map((u) => ({ email: u.email.toLowerCase(), name: u.name, agencyAdmin: true, cells: {} }));
  const adminEmails = new Set(admins.map((a) => a.email));

  const members = new Map<string, PersonRow>();
  for (const m of memberships) {
    if (!storeIds.has(m.storeId)) continue;
    const email = m.email.toLowerCase();
    if (adminEmails.has(email)) continue;
    const row = members.get(email) ?? { email, name: m.name, agencyAdmin: false, cells: {} };
    if (m.status === "active") row.name = m.name;
    row.cells[m.storeId] = { membershipId: m.id, role: m.role, status: m.status };
    members.set(email, row);
  }

  const byName = (a: PersonRow, b: PersonRow) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email);
  return [...admins.sort(byName), ...[...members.values()].sort(byName)];
}

/**
 * The per-store roles chosen on the invite form, posted as `role.<storeId>`.
 * "none" and unknown roles are dropped, and so is any store not in `allowed`.
 */
export function chosenRoles(formData: FormData, allowed: Set<string>): Map<string, StoreRole> {
  const chosen = new Map<string, StoreRole>();
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("role.")) continue;
    const storeId = key.slice("role.".length);
    const role = String(value) as StoreRole;
    if (allowed.has(storeId) && STORE_ROLES.includes(role)) chosen.set(storeId, role);
  }
  return chosen;
}

import "server-only";
import type { PersonRow } from "../people";
import type { Membership } from "../types";

/**
 * A store membership as the API shows it. The acceptance token is never
 * included: it signs whoever holds it into the store.
 */
export function presentMembership(membership: Membership) {
  return {
    id: membership.id,
    storeId: membership.storeId,
    userId: membership.userId,
    email: membership.email,
    name: membership.name,
    role: membership.role,
    status: membership.status,
    invitedBy: membership.invitedBy,
    invitedAt: membership.invitedAt,
    acceptedAt: membership.acceptedAt,
    language: membership.language ?? null,
  };
}

/** One row of the agency's People grid: a person and their role per store. */
export function presentPerson(row: PersonRow) {
  return {
    email: row.email,
    name: row.name,
    agencyAdmin: row.agencyAdmin,
    stores: Object.entries(row.cells).map(([storeId, cell]) => ({
      storeId,
      membershipId: cell.membershipId,
      role: cell.role,
      status: cell.status,
    })),
  };
}

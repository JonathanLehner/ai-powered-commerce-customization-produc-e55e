/**
 * Who may open a store, and what they may do once inside.
 *
 * Kept free of request state so it can be reasoned about — and checked by
 * `npm run platform-access-check` — on its own. `lib/session.ts` re-exports it
 * and does the reading.
 */
import type { Membership, Store, StoreRole, User } from "./types";

export type Capability =
  | "store.settings"
  | "store.team"
  | "store.catalog"
  | "store.orders"
  | "store.storefront"
  | "store.gifting"
  | "store.view";

const ROLE_CAPABILITIES: Record<StoreRole, Capability[]> = {
  store_admin: [
    "store.settings",
    "store.team",
    "store.catalog",
    "store.orders",
    "store.storefront",
    "store.gifting",
    "store.view",
  ],
  catalog_manager: ["store.catalog", "store.storefront", "store.gifting", "store.view"],
  order_manager: ["store.orders", "store.view"],
  viewer: ["store.view"],
};

export function roleCan(role: StoreRole, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

export interface StoreGrant {
  role: StoreRole;
  /** True when the user reaches the store through agency ownership rather than an explicit invite. */
  viaAgency: boolean;
  /**
   * True when the only reason the store opens is platform oversight. The user
   * holds no membership and the store belongs to someone else's agency, so the
   * screens read as status without shopper records.
   */
  viaPlatform: boolean;
}

/** Resolves the effective store role for a user, or null when they have no access. */
export function resolveStoreRole(user: User, store: Store, memberships: Membership[]): StoreGrant | null {
  // Platform administrators operate the platform, not its stores. They see that
  // a store exists and how it is running; nothing here is theirs to change.
  if (user.platformRole === "platform_admin") {
    return { role: "viewer", viaAgency: false, viaPlatform: true };
  }
  if (user.platformRole === "agency_admin" && user.agencyId === store.agencyId) {
    return { role: "store_admin", viaAgency: true, viaPlatform: false };
  }
  const match = memberships.find((m) => m.storeId === store.id && m.status === "active");
  if (!match) return null;
  return { role: match.role, viaAgency: false, viaPlatform: false };
}

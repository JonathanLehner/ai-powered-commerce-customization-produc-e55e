import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getStore, getUserById, listMembershipsForUser } from "./data";
import type { Membership, Store, StoreRole, User } from "./types";

export const SESSION_COOKIE = "cc_session";
export const SHOPPER_COOKIE = "cc_shopper";

export type Capability =
  | "store.settings"
  | "store.team"
  | "store.catalog"
  | "store.orders"
  | "store.storefront"
  | "store.view";

const ROLE_CAPABILITIES: Record<StoreRole, Capability[]> = {
  store_admin: ["store.settings", "store.team", "store.catalog", "store.orders", "store.storefront", "store.view"],
  catalog_manager: ["store.catalog", "store.storefront", "store.view"],
  order_manager: ["store.orders", "store.view"],
  viewer: ["store.view"],
};

export function roleCan(role: StoreRole, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

async function sessionUserId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}

export async function getSessionUser(): Promise<User | null> {
  const id = await sessionUserId();
  if (!id) return null;
  return (await getUserById(id)) ?? null;
}

export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requirePlatformAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.platformRole !== "platform_admin") redirect("/app");
  return user;
}

export interface StoreAccess {
  user: User;
  store: Store;
  role: StoreRole;
  /** True when the user reaches the store through agency ownership rather than an explicit invite. */
  viaAgency: boolean;
}

/** Resolves the effective store role for a user, or null when they have no access. */
export function resolveStoreRole(
  user: User,
  store: Store,
  memberships: Membership[],
): { role: StoreRole; viaAgency: boolean } | null {
  if (user.platformRole === "platform_admin") return { role: "store_admin", viaAgency: true };
  if (user.platformRole === "agency_admin" && user.agencyId === store.agencyId) {
    return { role: "store_admin", viaAgency: true };
  }
  const match = memberships.find((m) => m.storeId === store.id && m.status === "active");
  if (!match) return null;
  return { role: match.role, viaAgency: false };
}

type AccessDenial = "signed_out" | "no_store" | "not_a_member" | "capability";

/**
 * Resolves the signed-in user, the store and the user's memberships in a single
 * wave of reads.
 *
 * They used to run one after another, which cost three round trips — around a
 * second and a half — before an action or a page had even started its own work,
 * and every page in a store paid it twice because the layout checks access too.
 * The membership list is only needed for invited users, but asking for it up
 * front costs nothing in wall-clock time and saves a second round trip when it
 * is needed. Repeat reads inside the same request are served from the memo in
 * `lib/platform.ts`.
 */
async function loadStoreAccess(
  storeId: string,
  capability: Capability,
): Promise<{ access: StoreAccess; denied: null } | { access: StoreAccess | null; denied: AccessDenial }> {
  const userId = await sessionUserId();
  if (!userId) return { access: null, denied: "signed_out" };

  const [user, store, memberships] = await Promise.all([
    getUserById(userId),
    getStore(storeId),
    listMembershipsForUser(userId),
  ]);
  if (!user) return { access: null, denied: "signed_out" };
  if (!store) return { access: null, denied: "no_store" };

  const resolved = resolveStoreRole(user, store, memberships);
  if (!resolved) return { access: null, denied: "not_a_member" };

  const access: StoreAccess = { user, store, role: resolved.role, viaAgency: resolved.viaAgency };
  if (!roleCan(resolved.role, capability)) return { access, denied: "capability" };
  return { access, denied: null };
}

export async function requireStoreAccess(storeId: string, capability: Capability = "store.view"): Promise<StoreAccess> {
  const { access, denied } = await loadStoreAccess(storeId, capability);
  if (denied === "signed_out") redirect("/login");
  if (denied === "no_store") redirect("/app");
  if (denied === "not_a_member") redirect("/app?denied=1");
  if (denied === "capability") redirect(`/app/stores/${storeId}?denied=${capability}`);
  return access as StoreAccess;
}

/** Store access for server actions — throws instead of redirecting. */
export async function assertStoreAccess(storeId: string, capability: Capability): Promise<StoreAccess> {
  const { access, denied } = await loadStoreAccess(storeId, capability);
  if (denied === "signed_out") throw new Error("You are signed out. Sign in again to continue.");
  if (denied === "no_store") throw new Error("Store not found.");
  if (denied === "not_a_member") throw new Error("You do not have access to this store.");
  if (denied === "capability") throw new Error("Your role does not allow this action.");
  return access as StoreAccess;
}

export async function assertPlatformAdmin(): Promise<User> {
  const user = await getSessionUser();
  if (!user) throw new Error("You are signed out. Sign in again to continue.");
  if (user.platformRole !== "platform_admin") throw new Error("Platform administrator access required.");
  return user;
}

/** Stores accessible to a user, used by the dashboard and the store switcher. */
export async function accessibleStores(user: User): Promise<{ store: Store; role: StoreRole }[]> {
  const { listAllStores, listStoresForAgency } = await import("./data");
  if (user.platformRole === "platform_admin") {
    const stores = await listAllStores();
    return stores.map((store) => ({ store, role: "store_admin" as StoreRole }));
  }
  if (user.platformRole === "agency_admin" && user.agencyId) {
    const stores = await listStoresForAgency(user.agencyId);
    return stores.map((store) => ({ store, role: "store_admin" as StoreRole }));
  }
  const memberships = (await listMembershipsForUser(user.id)).filter((m) => m.status === "active");
  // One read per membership, all in flight together — fetched in sequence this
  // was the slowest part of loading the store switcher.
  const stores = await Promise.all(memberships.map((m) => getStore(m.storeId)));
  return memberships.flatMap((m, index) => {
    const store = stores[index];
    return store ? [{ store, role: m.role }] : [];
  });
}

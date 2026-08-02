import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getStore, getUserById, listMembershipsForUser } from "./data";
import type { Store, StoreRole, User } from "./types";

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

export async function getSessionUser(): Promise<User | null> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
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
export async function resolveStoreRole(
  user: User,
  store: Store,
): Promise<{ role: StoreRole; viaAgency: boolean } | null> {
  if (user.platformRole === "platform_admin") return { role: "store_admin", viaAgency: true };
  if (user.platformRole === "agency_admin" && user.agencyId === store.agencyId) {
    return { role: "store_admin", viaAgency: true };
  }
  const memberships = await listMembershipsForUser(user.id);
  const match = memberships.find((m) => m.storeId === store.id && m.status === "active");
  if (!match) return null;
  return { role: match.role, viaAgency: false };
}

export async function requireStoreAccess(storeId: string, capability: Capability = "store.view"): Promise<StoreAccess> {
  const user = await requireUser();
  const store = await getStore(storeId);
  if (!store) redirect("/app");
  const resolved = await resolveStoreRole(user, store);
  if (!resolved) redirect("/app?denied=1");
  if (!roleCan(resolved.role, capability)) redirect(`/app/stores/${store.id}?denied=${capability}`);
  return { user, store, role: resolved.role, viaAgency: resolved.viaAgency };
}

/** Store access for server actions — throws instead of redirecting. */
export async function assertStoreAccess(storeId: string, capability: Capability): Promise<StoreAccess> {
  const user = await getSessionUser();
  if (!user) throw new Error("You are signed out. Sign in again to continue.");
  const store = await getStore(storeId);
  if (!store) throw new Error("Store not found.");
  const resolved = await resolveStoreRole(user, store);
  if (!resolved) throw new Error("You do not have access to this store.");
  if (!roleCan(resolved.role, capability)) {
    throw new Error("Your role does not allow this action.");
  }
  return { user, store, role: resolved.role, viaAgency: resolved.viaAgency };
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
  const result: { store: Store; role: StoreRole }[] = [];
  for (const m of memberships) {
    const store = await getStore(m.storeId);
    if (store) result.push({ store, role: m.role });
  }
  return result;
}

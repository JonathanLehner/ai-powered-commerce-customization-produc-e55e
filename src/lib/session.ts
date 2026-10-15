import "server-only";
import { getLocale } from "next-intl/server";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAgency, getStore, getUserById, listMembershipsForUser } from "./data";
import type { OperationContext } from "./operations/context";
import { resolveStoreRole, roleCan, type Capability } from "./store-access";
import { billingPending } from "./trial";
import type { Membership, Store, StoreRole, User } from "./types";

export { SHOPPER_COOKIE } from "./storefront-data";

export { resolveStoreRole, roleCan };
export type { Capability, StoreGrant } from "./store-access";

/**
 * The signed-in user's id, taken from the Auth.js session token.
 *
 * Memoised per render: a store page checks access in its layout and again in
 * the page itself, and verifying the token's signature twice for the same
 * request is pure waste.
 */
const sessionUserId = cache(async (): Promise<string | null> => {
  const session = await auth();
  return session?.user?.id ?? null;
});

/**
 * Memoised per render as well: the workspace's language is read from the user
 * record, and so is the layout's own sign-in check.
 */
export const getSessionUser = cache(async (): Promise<User | null> => {
  const id = await sessionUserId();
  if (!id) return null;
  const user = await getUserById(id);
  // A removed platform administrator's session ends with their access.
  return user && !user.accessRemovedAt ? user : null;
});

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

/** The agency's own administrator, for agency-wide pages such as People. */
export async function requireAgencyAdmin(): Promise<User & { agencyId: string }> {
  const user = await requireUser();
  if (user.platformRole !== "agency_admin" || !user.agencyId) redirect("/app");
  return user as User & { agencyId: string };
}

/** `requireAgencyAdmin` for server actions — throws instead of redirecting. */
export async function assertAgencyAdmin(): Promise<User & { agencyId: string }> {
  const user = await getSessionUser();
  if (!user) throw new Error("You are signed out. Sign in again to continue.");
  if (user.platformRole !== "agency_admin" || !user.agencyId) throw new Error("Agency administrator access required.");
  return user as User & { agencyId: string };
}

export interface StoreAccess {
  user: User;
  store: Store;
  role: StoreRole;
  /** True when the user reaches the store through agency ownership rather than an explicit invite. */
  viaAgency: boolean;
  /**
   * True when the only reason the store opens is platform oversight. The user
   * holds no membership and the store belongs to someone else's agency, so the
   * screens read as status without shopper records.
   */
  viaPlatform: boolean;
  /**
   * True once the agency's free trial has ended without payment details. The
   * store opens as it would for its role, but `role` is `viewer`, so the pages
   * show what they show a viewer and every change is refused.
   */
  readOnly: boolean;
  /** The role the user holds in the store, which `role` only differs from while `readOnly`. */
  grantedRole: StoreRole;
}

/** The refusal for a change while the agency has to add payment details. */
export const READ_ONLY_MESSAGE = "Your free trial has ended. Add payment details in Billing to make changes.";

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
 * is needed.
 */
async function loadStoreAccess(
  storeId: string,
  capability: Capability,
  records: (storeId: string) => Promise<StoreRecords | null> = readStoreRecords,
): Promise<{ access: StoreAccess; denied: null } | { access: StoreAccess | null; denied: AccessDenial }> {
  const read = await records(storeId);
  if (!read) return { access: null, denied: "signed_out" };
  const { user, store, memberships } = read;
  if (!user) return { access: null, denied: "signed_out" };
  if (!store) return { access: null, denied: "no_store" };

  const resolved = resolveStoreRole(user, store, memberships);
  if (!resolved) return { access: null, denied: "not_a_member" };

  const access: StoreAccess = {
    user,
    store,
    role: resolved.role,
    viaAgency: resolved.viaAgency,
    viaPlatform: resolved.viaPlatform,
    readOnly: false,
    grantedRole: resolved.role,
  };
  if (!roleCan(resolved.role, capability)) return { access, denied: "capability" };
  return { access, denied: null };
}

type StoreRecords = { user: User | null; store: Store | null; memberships: Membership[] };

async function readStoreRecords(storeId: string): Promise<StoreRecords | null> {
  const userId = await sessionUserId();
  if (!userId) return null;
  const [user, store, memberships] = await Promise.all([
    getSessionUser(),
    getStore(storeId),
    listMembershipsForUser(userId),
  ]);
  return { user, store, memberships };
}

/**
 * The same reads, memoised for one render: a store page's layout and the page
 * itself both check access. Server actions read afresh, since they may be
 * about to change these records.
 */
const renderStoreRecords = cache(readStoreRecords);

export async function requireStoreAccess(storeId: string, capability: Capability = "store.view"): Promise<StoreAccess> {
  const { access, denied } = await loadStoreAccess(storeId, capability, renderStoreRecords);
  if (denied === "signed_out") redirect("/login");
  if (denied === "no_store") redirect("/app");
  if (denied === "not_a_member") redirect("/app?denied=1");
  if (denied === "capability") redirect(`/app/stores/${storeId}?denied=${capability}`);
  const granted = access as StoreAccess;
  if (granted.viaPlatform || !billingPending(await getAgencyForRender(granted.store.agencyId))) return granted;
  return { ...granted, role: "viewer", readOnly: true };
}

/** Store access for server actions — throws instead of redirecting. */
export async function assertStoreAccess(storeId: string, capability: Capability): Promise<StoreAccess> {
  const { access, denied } = await loadStoreAccess(storeId, capability);
  if (denied === "signed_out") throw new Error("You are signed out. Sign in again to continue.");
  if (denied === "no_store") throw new Error("Store not found.");
  if (denied === "not_a_member") throw new Error("You do not have access to this store.");
  if (denied === "capability") throw new Error("Your role does not allow this action.");
  const granted = access as StoreAccess;
  if (capability !== "store.view" && billingPending(await getAgency(granted.store.agencyId))) throw new Error(READ_ONLY_MESSAGE);
  return granted;
}

/** What a server action hands a store operation: the store, the signed-in person and their language. */
export async function operationContext(access: Pick<StoreAccess, "store" | "user">): Promise<OperationContext> {
  return { store: access.store, actor: { id: access.user.id, name: access.user.name }, locale: await getLocale() };
}

export async function assertPlatformAdmin(): Promise<User> {
  const user = await getSessionUser();
  if (!user) throw new Error("You are signed out. Sign in again to continue.");
  if (user.platformRole !== "platform_admin") throw new Error("Platform administrator access required.");
  return user;
}

export interface AccessibleStore {
  store: Store;
  role: StoreRole;
  /** See `StoreAccess.viaPlatform` — oversight rather than membership. */
  viaPlatform: boolean;
}

/**
 * The user's agency, memoised per render: the workspace layout's billing
 * banners and the page below it both want it.
 */
export const getAgencyForRender = cache((agencyId: string) => getAgency(agencyId));

/**
 * Stores accessible to a user, used by the dashboard and the store switcher.
 * Memoised per render, since a store page's header and the page itself both ask.
 */
export const accessibleStores = cache(readAccessibleStores);

async function readAccessibleStores(user: User): Promise<AccessibleStore[]> {
  const { getStoresByIds, listAllStores, listStoresForAgency } = await import("./data");
  if (user.platformRole === "platform_admin") {
    const stores = await listAllStores();
    return stores.map((store) => ({ store, role: "viewer" as StoreRole, viaPlatform: true }));
  }
  if (user.platformRole === "agency_admin" && user.agencyId) {
    const stores = await listStoresForAgency(user.agencyId);
    return stores.map((store) => ({ store, role: "store_admin" as StoreRole, viaPlatform: false }));
  }
  const memberships = (await listMembershipsForUser(user.id)).filter((m) => m.status === "active");
  // Every membership's store in one read. In flight together it was still one
  // fetch per store, and the platform runs only about six at a time, so a user
  // invited to many stores waited through wave after wave of them.
  const stores = await getStoresByIds(memberships.map((m) => m.storeId));
  return memberships.flatMap((m) => {
    const store = stores.get(m.storeId);
    return store ? [{ store, role: m.role, viaPlatform: false }] : [];
  });
}

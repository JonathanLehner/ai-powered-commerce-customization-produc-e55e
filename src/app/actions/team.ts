"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  COLLECTIONS,
  getMembership,
  getMembershipByToken,
  getStore,
  getUserByEmail,
  listMemberships,
  listMembershipsForStores,
  listStoresForAgency,
  recordAudit,
} from "@/lib/data";
import { sendEmail, siteOrigin } from "@/lib/email";
import { brandFor, teamInviteEmail } from "@/lib/email-templates";
import { isLocale } from "@/i18n/locales";
import { emailCopy } from "@/i18n/storefront";
import { db } from "@/lib/mongo";
import { chosenRoles } from "@/lib/people";
import { assertAgencyAdmin, assertStoreAccess } from "@/lib/session";
import { STORE_ROLE_LABELS, type Membership, type Store, type StoreRole, type User } from "@/lib/types";
import { newId } from "@/lib/util";
import { signInUser } from "./auth";
import type { ActionState } from "./stores";

const ROLES: StoreRole[] = ["store_admin", "catalog_manager", "order_manager", "viewer"];

export async function inviteTeamMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "viewer") as StoreRole;
  const language = String(formData.get("language") ?? "");
  const t = await getTranslations("actions.team");

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { status: "error", message: t("emailInvalid"), field: "email" };
  }
  if (name.length < 2) {
    return { status: "error", message: t("nameRequired"), field: "name" };
  }
  if (!ROLES.includes(role)) {
    return { status: "error", message: t("roleInvalid"), field: "role" };
  }

  const [{ user, store }, existing, account] = await Promise.all([
    assertStoreAccess(storeId, "store.team"),
    listMemberships(storeId),
    getUserByEmail(email),
  ]);
  if (existing.some((m) => m.email.toLowerCase() === email)) {
    return { status: "error", message: t("alreadyMember"), field: "email" };
  }

  const membership: Membership = {
    id: newId("mem"),
    storeId,
    agencyId: store.agencyId,
    userId: account?.id ?? null,
    email,
    name: account?.name ?? name,
    role,
    status: account ? "active" : "invited",
    invitedBy: user.name,
    invitedAt: new Date().toISOString(),
    acceptedAt: account ? new Date().toISOString() : null,
    inviteToken: account ? null : newId("inv"),
    ...(isLocale(language) ? { language } : {}),
  };

  await db.insertOne(COLLECTIONS.memberships, membership as unknown as Record<string, unknown>);
  recordAudit({
    category: "team",
    action: "team.invited",
    summary: `Invited ${email} as ${STORE_ROLE_LABELS[role].toLowerCase()}`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "membership",
    entityId: membership.id,
    meta: { role, email },
  });

  if (membership.inviteToken) {
    await emailInvitation(store, membership, user.name);
  }

  revalidatePath(`/app/stores/${storeId}/team`);
  return {
    status: "success",
    message: account
      ? t("activeNow", { name: account.name })
      : t("invited", { email }),
  };
}

/**
 * Invites one person to several of the agency's stores at once, with a role
 * chosen per store. Each store gets its own membership, invitation and activity
 * entry, exactly as if it had been sent from that store's Team page. Stores the
 * person is already on are left as they are, and the write is keyed on store and
 * email, so a repeated submission adds nothing twice.
 */
export async function invitePerson(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const language = String(formData.get("language") ?? "");
  const t = await getTranslations("actions.team");

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { status: "error", message: t("emailInvalid"), field: "email" };
  }
  if (name.length < 2) {
    return { status: "error", message: t("nameRequired"), field: "name" };
  }

  const user = await assertAgencyAdmin();
  const [stores, account] = await Promise.all([listStoresForAgency(user.agencyId), getUserByEmail(email)]);
  const open = stores.filter((store) => store.status === "active");
  const chosen = chosenRoles(formData, new Set(open.map((store) => store.id)));
  if (chosen.size === 0) {
    return { status: "error", message: t("storesRequired"), field: "stores" };
  }
  if (account?.platformRole === "agency_admin" && account.agencyId === user.agencyId) {
    return { status: "error", message: t("isAgencyAdmin", { name: account.name }), field: "email" };
  }

  const existing = await listMembershipsForStores([...chosen.keys()]);
  const already = new Set(existing.filter((m) => m.email.toLowerCase() === email).map((m) => m.storeId));
  const targets = open.filter((store) => chosen.has(store.id) && !already.has(store.id));
  if (targets.length === 0) {
    return { status: "error", message: t("alreadyOnAll"), field: "stores" };
  }

  const now = new Date().toISOString();
  const added = await Promise.all(
    targets.map(async (store) => {
      const role = chosen.get(store.id)!;
      const membership: Membership = {
        id: newId("mem"),
        storeId: store.id,
        agencyId: store.agencyId,
        userId: account?.id ?? null,
        email,
        name: account?.name ?? name,
        role,
        status: account ? "active" : "invited",
        invitedBy: user.name,
        invitedAt: now,
        acceptedAt: account ? now : null,
        inviteToken: account ? null : newId("inv"),
        ...(isLocale(language) ? { language } : {}),
      };
      // The filter's own fields are written by the upsert itself.
      const filter = { storeId: store.id, email };
      const fields = Object.fromEntries(Object.entries(membership).filter(([key]) => !(key in filter)));
      const result = await db.upsertOne(COLLECTIONS.memberships, filter, { $setOnInsert: fields });
      if (result.upsertedCount === 0) return null;
      recordAudit({
        category: "team",
        action: "team.invited",
        summary: `Invited ${email} as ${STORE_ROLE_LABELS[role].toLowerCase()}`,
        storeId: store.id,
        agencyId: store.agencyId,
        actorId: user.id,
        actorName: user.name,
        entity: "membership",
        entityId: membership.id,
        meta: { role, email, via: "people" },
      });
      if (membership.inviteToken) await emailInvitation(store, membership, user.name);
      revalidatePath(`/app/stores/${store.id}/team`);
      return membership;
    }),
  );
  const count = added.filter(Boolean).length;
  if (count === 0) {
    return { status: "error", message: t("alreadyOnAll"), field: "stores" };
  }

  revalidatePath("/app/people");
  return {
    status: "success",
    message: account
      ? t("activeInStores", { name: account.name, count })
      : t("invitedToStores", { email, count }),
  };
}

/**
 * Takes a person off every store listed in the confirmation, in one step. Only
 * the memberships the admin was shown are removed, so a stale page never takes
 * away access it did not list. Each store records its own activity entry.
 */
export async function removePersonEverywhere(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const ids = new Set(formData.getAll("membershipId").map(String));
  if (!email || ids.size === 0) return;

  const user = await assertAgencyAdmin();
  const stores = await listStoresForAgency(user.agencyId);
  const byId = new Map(stores.map((store) => [store.id, store]));
  const memberships = (await listMembershipsForStores([...byId.keys()])).filter(
    (m) => ids.has(m.id) && m.email.toLowerCase() === email,
  );

  await Promise.all(
    memberships.map(async (membership) => {
      const store = byId.get(membership.storeId)!;
      const result = await db.deleteOne(COLLECTIONS.memberships, { id: membership.id });
      if (result.deletedCount === 0) return;
      recordAudit({
        category: "team",
        action: "team.removed",
        summary: `Removed ${membership.email} from the store team`,
        storeId: store.id,
        agencyId: store.agencyId,
        actorId: user.id,
        actorName: user.name,
        entity: "membership",
        entityId: membership.id,
        meta: { email: membership.email, via: "people" },
      });
      revalidatePath(`/app/stores/${store.id}/team`);
    }),
  );
  revalidatePath("/app/people");
}

/**
 * Emails one invitation. The acceptance link has to be absolute, and it is the
 * same link the members list shows, so a person who never receives the email
 * can still be sent it by hand. It is written in the recipient's language: the
 * one their account uses if they have one, else the one chosen when inviting.
 */
async function emailInvitation(
  store: Store,
  membership: Membership,
  inviterName: string,
): Promise<void> {
  try {
    const [origin, account] = await Promise.all([siteOrigin(), getUserByEmail(membership.email)]);
    const language = [account?.uiLanguage, membership.language].find(isLocale) ?? store.defaultLanguage;
    const roles = await getTranslations({ locale: isLocale(language) ? language : "en", namespace: "roles" });
    sendEmail({
      to: membership.email,
      message: teamInviteEmail(brandFor(store), await emailCopy(language), {
        name: membership.name,
        inviterName,
        roleLabel: roles(membership.role),
        acceptUrl: `${origin}/invite/${membership.inviteToken}`,
      }),
      kind: "team invitation",
      storeId: store.id,
      agencyId: store.agencyId,
      entity: "membership",
      entityId: membership.id,
    });
  } catch (error) {
    console.error("Team invitation email could not be queued", error);
  }
}

export async function changeMemberRole(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const membershipId = String(formData.get("membershipId") ?? "");
  const role = String(formData.get("role") ?? "") as StoreRole;
  if (!ROLES.includes(role)) return;

  const { user, store } = await assertStoreAccess(storeId, "store.team");
  const membership = await getMembership(membershipId);
  if (!membership || membership.storeId !== storeId) return;
  if (membership.role === role) return;

  await db.updateOne(COLLECTIONS.memberships, { id: membershipId }, { $set: { role } });
  recordAudit({
    category: "team",
    action: "team.role_changed",
    summary: `Changed ${membership.email} from ${STORE_ROLE_LABELS[membership.role].toLowerCase()} to ${STORE_ROLE_LABELS[role].toLowerCase()}`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "membership",
    entityId: membershipId,
    meta: { from: membership.role, to: role },
  });
  revalidatePath(`/app/stores/${storeId}/team`);
}

export async function removeMember(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const membershipId = String(formData.get("membershipId") ?? "");

  const { user, store } = await assertStoreAccess(storeId, "store.team");
  const membership = await getMembership(membershipId);
  if (!membership || membership.storeId !== storeId) return;

  await db.deleteOne(COLLECTIONS.memberships, { id: membershipId });
  recordAudit({
    category: "team",
    action: "team.removed",
    summary: `Removed ${membership.email} from the store team`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "membership",
    entityId: membershipId,
    meta: { email: membership.email },
  });
  revalidatePath(`/app/stores/${storeId}/team`);
}

export async function resendInvite(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const membershipId = String(formData.get("membershipId") ?? "");

  const { user, store } = await assertStoreAccess(storeId, "store.team");
  const membership = await getMembership(membershipId);
  if (!membership || membership.storeId !== storeId || membership.status !== "invited") return;

  const token = newId("inv");
  await db.updateOne(
    COLLECTIONS.memberships,
    { id: membershipId },
    { $set: { invitedAt: new Date().toISOString(), invitedBy: user.name, inviteToken: token } },
  );
  await emailInvitation(store, { ...membership, inviteToken: token }, user.name);
  recordAudit({
    category: "team",
    action: "team.invite_resent",
    summary: `Issued a new acceptance link for ${membership.email} and emailed it to them`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "membership",
    entityId: membershipId,
    meta: {},
  });
  revalidatePath(`/app/stores/${storeId}/team`);
}

/**
 * Opens the account behind an invitation link: creates the person's user record
 * the first time, activates their membership, signs them in and drops them into
 * the store. The token is single-use — it is cleared here, so a reused link
 * lands on the "already accepted" screen instead of re-running any of this.
 */
export async function acceptInvitation(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const membership = await getMembershipByToken(token);
  if (!membership || membership.status !== "invited") redirect("/login");

  const store = await getStore(membership.storeId);
  if (!store) redirect("/login");

  const now = new Date().toISOString();
  let account = await getUserByEmail(membership.email);
  if (!account) {
    const user: User = {
      id: newId("usr"),
      email: membership.email,
      name: membership.name,
      password: newId("pw"),
      platformRole: "agency_member",
      agencyId: membership.agencyId,
      title: STORE_ROLE_LABELS[membership.role],
      createdAt: now,
      ...(isLocale(membership.language) ? { uiLanguage: membership.language } : {}),
    };
    await db.insertOne(COLLECTIONS.users, user as unknown as Record<string, unknown>);
    account = user;
  }

  await db.updateOne(
    COLLECTIONS.memberships,
    { id: membership.id },
    { $set: { status: "active", userId: account.id, acceptedAt: now, name: account.name, inviteToken: null } },
  );
  recordAudit({
    category: "team",
    action: "team.invite_accepted",
    summary: `${account.name} accepted the invitation to ${store.name}`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: account.id,
    actorName: account.name,
    entity: "membership",
    entityId: membership.id,
    meta: { role: membership.role, email: membership.email },
    notify: { type: "invite_accepted", href: `/app/stores/${store.id}/team`, params: { name: account.name } },
  });

  revalidatePath(`/app/stores/${store.id}/team`);
  await signInUser(account.id);
  redirect(`/app/stores/${store.id}`);
}

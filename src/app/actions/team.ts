"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { hash } from "bcryptjs";
import { redirect } from "next/navigation";
import { COLLECTIONS, getMembershipByToken, getStore, getUserByEmail, recordAudit } from "@/lib/data";
import { isLocale } from "@/i18n/locales";
import { db } from "@/lib/mongo";
import { refusal } from "@/lib/operations/action-state";
import {
  agencyContext,
  invitePerson as invitePersonToStores,
  removePersonEverywhere as removePerson,
} from "@/lib/operations/agency";
import {
  changeMemberRole as changeRole,
  findMembership,
  inviteTeamMember as invite,
  removeMember as remove,
  resendInvite as resend,
} from "@/lib/operations/team";
import { assertAgencyAdmin, assertStoreAccess, operationContext } from "@/lib/session";
import { STORE_ROLE_LABELS, type StoreRole, type User } from "@/lib/types";
import { newId } from "@/lib/util";
import { hasUsablePassword } from "@/lib/demo-personas";
import { MIN_PASSWORD_LENGTH } from "@/lib/signup";
import { signInUser } from "./auth";
import type { ActionState } from "./stores";

const ROLES: StoreRole[] = ["store_admin", "catalog_manager", "order_manager", "viewer"];

export async function inviteTeamMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, "store.team");
  const t = await getTranslations("actions.team");

  try {
    const { membership, accountName } = await invite(await operationContext(access), {
      email: String(formData.get("email") ?? ""),
      name: String(formData.get("name") ?? ""),
      role: String(formData.get("role") ?? "viewer"),
      language: String(formData.get("language") ?? ""),
    });
    return {
      status: "success",
      message: accountName ? t("activeNow", { name: accountName }) : t("invited", { email: membership.email }),
    };
  } catch (error) {
    return refusal(error);
  }
}

/**
 * Invites one person to several of the agency's stores at once, with a role
 * chosen per store (posted as `role.<storeId>`). See `invitePerson` in
 * `@/lib/operations/agency`.
 */
export async function invitePerson(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertAgencyAdmin();
  const t = await getTranslations("actions.team");
  const roles = [...formData.entries()]
    .filter(([key]) => key.startsWith("role."))
    .map(([key, value]): [string, string] => [key.slice("role.".length), String(value)]);

  try {
    const { added, accountName } = await invitePersonToStores(await agencyContext(user), {
      email: String(formData.get("email") ?? ""),
      name: String(formData.get("name") ?? ""),
      language: String(formData.get("language") ?? ""),
      roles,
    });
    const count = added.length;
    return {
      status: "success",
      message: accountName
        ? t("activeInStores", { name: accountName, count })
        : t("invitedToStores", { email: added[0].email, count }),
    };
  } catch (error) {
    return refusal(error);
  }
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
  await removePerson(await agencyContext(user), { email, membershipIds: ids });
}

export async function changeMemberRole(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const membershipId = String(formData.get("membershipId") ?? "");
  const role = String(formData.get("role") ?? "") as StoreRole;
  if (!ROLES.includes(role)) return;

  const access = await assertStoreAccess(storeId, "store.team");
  const membership = await findMembership(storeId, membershipId);
  if (!membership) return;
  await changeRole(await operationContext(access), membership, role);
}

export async function removeMember(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const membershipId = String(formData.get("membershipId") ?? "");

  const access = await assertStoreAccess(storeId, "store.team");
  const membership = await findMembership(storeId, membershipId);
  if (!membership) return;
  await remove(await operationContext(access), membership);
}

export async function resendInvite(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const membershipId = String(formData.get("membershipId") ?? "");

  const access = await assertStoreAccess(storeId, "store.team");
  const membership = await findMembership(storeId, membershipId);
  if (!membership || membership.status !== "invited") return;
  await resend(await operationContext(access), membership);
}

/**
 * Opens the account behind an invitation link: creates the person's user record
 * the first time with the password they choose here, activates their
 * membership, signs them in and drops them into the store. An existing account
 * that has no password yet (invited before passwords were asked) sets one too. The token is single-use — it is cleared here, so a reused link
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
  const choosing = !account || !hasUsablePassword(account);
  const password = String(formData.get("password") ?? "");
  if (choosing && (password.length < MIN_PASSWORD_LENGTH || password.length > 200)) {
    redirect(`/invite/${encodeURIComponent(token)}?error=password`);
  }
  const passwordHash = choosing ? await hash(password, 10) : null;

  if (account && passwordHash) {
    await db.updateOne(COLLECTIONS.users, { id: account.id }, { $set: { password: passwordHash } });
  }
  if (!account) {
    const user: User = {
      id: newId("usr"),
      email: membership.email,
      name: membership.name,
      password: passwordHash!,
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

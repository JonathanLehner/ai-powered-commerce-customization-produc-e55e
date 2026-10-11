"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  COLLECTIONS,
  getMembership,
  getMembershipByToken,
  getStore,
  getUserByEmail,
  listMemberships,
  recordAudit,
} from "@/lib/data";
import { sendEmail, siteOrigin } from "@/lib/email";
import { brandFor, teamInviteEmail } from "@/lib/email-templates";
import { db } from "@/lib/mongo";
import { assertStoreAccess } from "@/lib/session";
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

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { status: "error", message: "Enter a valid email address for the person you are inviting.", field: "email" };
  }
  if (name.length < 2) {
    return { status: "error", message: "Enter the person's name so the team list is readable.", field: "name" };
  }
  if (!ROLES.includes(role)) {
    return { status: "error", message: "Choose one of the four store roles.", field: "role" };
  }

  const [{ user, store }, existing, account] = await Promise.all([
    assertStoreAccess(storeId, "store.team"),
    listMemberships(storeId),
    getUserByEmail(email),
  ]);
  if (existing.some((m) => m.email.toLowerCase() === email)) {
    return { status: "error", message: "That person already has access to this store.", field: "email" };
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
      ? `${account.name} already has a Parcelith account, so access is active immediately.`
      : `Invitation created for ${email} and the email is on its way. The acceptance link is also in the members list above if it never arrives.`,
  };
}

/**
 * Emails one invitation. The acceptance link has to be absolute, and it is the
 * same link the members list shows, so a person who never receives the email
 * can still be sent it by hand.
 */
async function emailInvitation(
  store: Store,
  membership: Membership,
  inviterName: string,
): Promise<void> {
  try {
    const origin = await siteOrigin();
    sendEmail({
      to: membership.email,
      message: teamInviteEmail(brandFor(store), {
        name: membership.name,
        inviterName,
        roleLabel: STORE_ROLE_LABELS[membership.role],
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
  });

  revalidatePath(`/app/stores/${store.id}/team`);
  await signInUser(account.id);
  redirect(`/app/stores/${store.id}`);
}

"use server";

import { revalidatePath } from "next/cache";
import { COLLECTIONS, getMembership, getUserByEmail, listMemberships, recordAudit } from "@/lib/data";
import { db } from "@/lib/platform";
import { assertStoreAccess } from "@/lib/session";
import { STORE_ROLE_LABELS, type Membership, type StoreRole } from "@/lib/types";
import { newId } from "@/lib/util";
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

  revalidatePath(`/app/stores/${storeId}/team`);
  return {
    status: "success",
    message: account
      ? `${account.name} already has a Parcelith account, so access is active immediately.`
      : `Invitation sent to ${email}. They will get access once they accept.`,
  };
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

  await db.updateOne(
    COLLECTIONS.memberships,
    { id: membershipId },
    { $set: { invitedAt: new Date().toISOString(), invitedBy: user.name } },
  );
  recordAudit({
    category: "team",
    action: "team.invite_resent",
    summary: `Resent the invitation to ${membership.email}`,
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

import "server-only";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { isLocale } from "@/i18n/locales";
import { emailCopy } from "@/i18n/storefront";
import { COLLECTIONS, getMembership, getUserByEmail, listMemberships, recordAudit } from "../data";
import { sendEmail, siteOrigin } from "../email";
import { brandFor, teamInviteEmail } from "../email-templates";
import { db } from "../mongo";
import { STORE_ROLES } from "../people";
import { STORE_ROLE_LABELS, type Membership, type Store, type StoreRole } from "../types";
import { newId } from "../util";
import { OperationError, type OperationContext } from "./context";

/**
 * A store's team: the people invited to it and their roles. The Team page's
 * forms and the Admin API both run these, so every invitation, role change and
 * removal is checked, emailed and recorded the same way.
 */

export const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** The membership, provided it belongs to the store. */
export async function findMembership(storeId: string, membershipId: string): Promise<Membership | null> {
  const membership = await getMembership(membershipId);
  return membership && membership.storeId === storeId ? membership : null;
}

/**
 * Emails one invitation. The acceptance link has to be absolute, and it is the
 * same link the members list shows, so a person who never receives the email
 * can still be sent it by hand. It is written in the recipient's language: the
 * one their account uses if they have one, else the one chosen when inviting.
 */
export async function emailInvitation(store: Store, membership: Membership, inviterName: string): Promise<void> {
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

export interface InviteInput {
  email: string;
  name: string;
  role: string;
  /** The language the invitation is written in; ignored unless supported. */
  language?: string;
}

/**
 * Gives a person a role in the store. Someone who already has an account is
 * active at once; anyone else is emailed an acceptance link.
 */
export async function inviteTeamMember(
  ctx: OperationContext,
  input: InviteInput,
): Promise<{ membership: Membership; accountName: string | null }> {
  const { store, actor } = ctx;
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.team" });
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const role = input.role as StoreRole;

  if (!EMAIL_PATTERN.test(email)) throw new OperationError("invalid", t("emailInvalid"), "email");
  if (name.length < 2) throw new OperationError("invalid", t("nameRequired"), "name");
  if (!STORE_ROLES.includes(role)) throw new OperationError("invalid", t("roleInvalid"), "role");

  const [existing, account] = await Promise.all([listMemberships(store.id), getUserByEmail(email)]);
  if (existing.some((m) => m.email.toLowerCase() === email)) {
    throw new OperationError("conflict", t("alreadyMember"), "email");
  }

  const membership: Membership = {
    id: newId("mem"),
    storeId: store.id,
    agencyId: store.agencyId,
    userId: account?.id ?? null,
    email,
    name: account?.name ?? name,
    role,
    status: account ? "active" : "invited",
    invitedBy: actor.name,
    invitedAt: new Date().toISOString(),
    acceptedAt: account ? new Date().toISOString() : null,
    inviteToken: account ? null : newId("inv"),
    ...(isLocale(input.language) ? { language: input.language } : {}),
  };

  await db.insertOne(COLLECTIONS.memberships, membership as unknown as Record<string, unknown>);
  recordAudit({
    category: "team",
    action: "team.invited",
    summary: `Invited ${email} as ${STORE_ROLE_LABELS[role].toLowerCase()}`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: actor.id,
    actorName: actor.name,
    entity: "membership",
    entityId: membership.id,
    meta: { role, email },
  });

  if (membership.inviteToken) {
    await emailInvitation(store, membership, actor.name);
  }

  revalidatePath(`/app/stores/${store.id}/team`);
  return { membership, accountName: account?.name ?? null };
}

/** Moves a member to another role. The same role again changes nothing. */
export async function changeMemberRole(
  ctx: OperationContext,
  membership: Membership,
  role: string,
): Promise<Membership> {
  const { store, actor } = ctx;
  if (!STORE_ROLES.includes(role as StoreRole)) {
    const t = await getTranslations({ locale: ctx.locale, namespace: "actions.team" });
    throw new OperationError("invalid", t("roleInvalid"), "role");
  }
  const next = role as StoreRole;
  if (membership.role === next) return membership;

  await db.updateOne(COLLECTIONS.memberships, { id: membership.id }, { $set: { role: next } });
  recordAudit({
    category: "team",
    action: "team.role_changed",
    summary: `Changed ${membership.email} from ${STORE_ROLE_LABELS[membership.role].toLowerCase()} to ${STORE_ROLE_LABELS[next].toLowerCase()}`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: actor.id,
    actorName: actor.name,
    entity: "membership",
    entityId: membership.id,
    meta: { from: membership.role, to: next },
  });
  revalidatePath(`/app/stores/${store.id}/team`);
  return { ...membership, role: next };
}

/** Takes a member, or a pending invitation, off the store. */
export async function removeMember(ctx: OperationContext, membership: Membership): Promise<void> {
  const { store, actor } = ctx;
  await db.deleteOne(COLLECTIONS.memberships, { id: membership.id });
  recordAudit({
    category: "team",
    action: "team.removed",
    summary: `Removed ${membership.email} from the store team`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: actor.id,
    actorName: actor.name,
    entity: "membership",
    entityId: membership.id,
    meta: { email: membership.email },
  });
  revalidatePath(`/app/stores/${store.id}/team`);
}

/**
 * Issues a new acceptance link for a pending invitation and emails it. The old
 * link stops working.
 */
export async function resendInvite(ctx: OperationContext, membership: Membership): Promise<Membership> {
  const { store, actor } = ctx;
  if (membership.status !== "invited") {
    throw new OperationError("conflict", "This person has already accepted their invitation.");
  }

  const token = newId("inv");
  const invitedAt = new Date().toISOString();
  await db.updateOne(
    COLLECTIONS.memberships,
    { id: membership.id },
    { $set: { invitedAt, invitedBy: actor.name, inviteToken: token } },
  );
  const updated = { ...membership, invitedAt, invitedBy: actor.name, inviteToken: token };
  await emailInvitation(store, updated, actor.name);
  recordAudit({
    category: "team",
    action: "team.invite_resent",
    summary: `Issued a new acceptance link for ${membership.email} and emailed it to them`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: actor.id,
    actorName: actor.name,
    entity: "membership",
    entityId: membership.id,
    meta: {},
  });
  revalidatePath(`/app/stores/${store.id}/team`);
  return updated;
}

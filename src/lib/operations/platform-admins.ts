import "server-only";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { emailCopy } from "@/i18n/storefront";
import type { ApiKey } from "../api-keys";
import { COLLECTIONS, getUserByEmail, getUserById, recordAudit } from "../data";
import { hasUsablePassword } from "../demo-personas";
import { sendEmail, siteOrigin } from "../email";
import { notificationEmail, platformBrand } from "../email-templates";
import { db } from "../mongo";
import { issueResetToken, revokeResetTokens } from "../password-reset";
import type { User } from "../types";
import { newId } from "../util";
import { EMAIL_PATTERN } from "./team";
import { OperationError, type PlatformContext } from "./context";

/**
 * The platform administrators: listed, added, re-invited and removed from
 * /admin/admins and through the platform operations of the Admin API. A new
 * administrator has no usable password until they open their invitation, which
 * is a password reset link that lasts a week.
 */

export const INVITE_LINK_DAYS = 7;

const PAGE = "/admin/admins";

export interface PlatformAdminRow {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  hasPassword: boolean;
}

function row(user: User): PlatformAdminRow {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    lastSignInAt: user.lastSignInAt ?? null,
    hasPassword: hasUsablePassword(user),
  };
}

/** A value bcrypt never produces, so no password opens the account. */
function unusablePassword(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function listPlatformAdmins(): Promise<PlatformAdminRow[]> {
  const users = await db.find<User>(COLLECTIONS.users, { platformRole: "platform_admin" }, { sort: { name: 1 } });
  return users.map(row);
}

/** The person behind the caller: the administrator signed in, or the one who made the platform key. */
async function callerUserId(ctx: PlatformContext): Promise<string> {
  const key = await db.findOne<ApiKey>(COLLECTIONS.apiKeys, { id: ctx.actor.id });
  return key ? key.createdById : ctx.actor.id;
}

async function admin(ctx: PlatformContext, userId: string): Promise<User> {
  const user = await getUserById(userId);
  if (user && user.platformRole === "platform_admin") return user;
  const t = await getTranslations({ locale: ctx.locale, namespace: "admin.admins.errors" });
  throw new OperationError("not_found", t("notFound"));
}

/** Issues a fresh invitation link, emails it and returns it for the inviting administrator. */
async function invite(ctx: PlatformContext, user: User): Promise<string> {
  const [token, origin, frame, t] = await Promise.all([
    issueResetToken(user.id, Date.now(), INVITE_LINK_DAYS * 24 * 60),
    siteOrigin(),
    emailCopy(ctx.locale),
    getTranslations({ locale: ctx.locale, namespace: "admin.admins.inviteEmail" }),
  ]);
  const url = `${origin}/login/reset/${token}`;
  sendEmail({
    to: user.email,
    message: notificationEmail(platformBrand(`${origin}/logo.png`), frame, {
      subject: t("subject"),
      heading: t("heading"),
      name: user.name.split(" ")[0] ?? "",
      paragraphs: [t("body", { inviter: ctx.actor.name }), t("expiry", { days: INVITE_LINK_DAYS })],
      action: { label: t("cta"), url },
    }),
    kind: "platform admin invitation",
    entity: "user",
    entityId: user.id,
  });
  return url;
}

export interface NewPlatformAdminInput {
  name: string;
  email: string;
}

/**
 * Makes a person a platform administrator and emails them a link to choose
 * their password. Someone in an agency is refused rather than moved out of it.
 */
export async function addPlatformAdmin(
  ctx: PlatformContext,
  input: NewPlatformAdminInput,
): Promise<{ admin: PlatformAdminRow; invitationUrl: string }> {
  const t = await getTranslations({ locale: ctx.locale, namespace: "admin.admins.errors" });
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (name.length < 2 || name.length > 80) throw new OperationError("invalid", t("nameRequired"), "name");
  if (!EMAIL_PATTERN.test(email) || email.length > 254) throw new OperationError("invalid", t("emailInvalid"), "email");

  const existing = await getUserByEmail(email);
  if (existing?.platformRole === "platform_admin") throw new OperationError("conflict", t("alreadyAdmin"), "email");
  if (existing?.agencyId) throw new OperationError("conflict", t("agencyAccount"), "email");

  let user: User;
  if (existing) {
    // An account whose access was removed earlier comes back as it was, with a new invitation.
    user = { ...existing, name, platformRole: "platform_admin", password: unusablePassword() };
    await db.updateOne(
      COLLECTIONS.users,
      { id: existing.id },
      { $set: { name, platformRole: "platform_admin", password: user.password }, $unset: { accessRemovedAt: "" } },
    );
    delete user.accessRemovedAt;
  } else {
    user = {
      id: newId("usr"),
      email,
      name,
      password: unusablePassword(),
      platformRole: "platform_admin",
      agencyId: null,
      title: "Platform administrator",
      createdAt: new Date().toISOString(),
    };
    await db.insertOne(COLLECTIONS.users, user as unknown as Record<string, unknown>);
  }

  const invitationUrl = await invite(ctx, user);
  recordAudit({
    category: "administration",
    action: "platform_admin.added",
    summary: `Added ${email} as a platform administrator and emailed an invitation`,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "user",
    entityId: user.id,
    meta: { email },
  });
  revalidatePath(PAGE);
  return { admin: row(user), invitationUrl };
}

/** A new invitation link for an administrator who has not chosen a password. Earlier links stop working. */
export async function resendPlatformAdminInvitation(
  ctx: PlatformContext,
  userId: string,
): Promise<{ admin: PlatformAdminRow; invitationUrl: string }> {
  const user = await admin(ctx, userId);
  if (hasUsablePassword(user)) {
    const t = await getTranslations({ locale: ctx.locale, namespace: "admin.admins.errors" });
    throw new OperationError("conflict", t("alreadyAccepted"));
  }
  const invitationUrl = await invite(ctx, user);
  recordAudit({
    category: "administration",
    action: "platform_admin.invitation_resent",
    summary: `Issued a new platform administrator invitation for ${user.email} and emailed it to them`,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "user",
    entityId: user.id,
    meta: { email: user.email },
  });
  revalidatePath(PAGE);
  return { admin: row(user), invitationUrl };
}

/**
 * Takes platform administration away and closes the account: the password is
 * replaced and every outstanding link is withdrawn. Nobody removes themselves
 * or the last administrator who can sign in.
 */
export async function removePlatformAdmin(ctx: PlatformContext, userId: string): Promise<PlatformAdminRow> {
  const t = await getTranslations({ locale: ctx.locale, namespace: "admin.admins.errors" });
  const user = await admin(ctx, userId);
  if (user.id === (await callerUserId(ctx))) throw new OperationError("conflict", t("removeSelf"));
  if (hasUsablePassword(user)) {
    const others = (await listPlatformAdmins()).filter((other) => other.id !== user.id && other.hasPassword);
    if (others.length === 0) throw new OperationError("conflict", t("removeLast"));
  }

  const accessRemovedAt = new Date().toISOString();
  await db.updateOne(
    COLLECTIONS.users,
    { id: user.id },
    { $set: { platformRole: "agency_member", password: unusablePassword(), accessRemovedAt } },
  );
  await revokeResetTokens(user.id);
  recordAudit({
    category: "administration",
    action: "platform_admin.removed",
    summary: `Removed platform administrator access for ${user.email}`,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "user",
    entityId: user.id,
    meta: { email: user.email },
  });
  revalidatePath(PAGE);
  return { ...row(user), hasPassword: false };
}

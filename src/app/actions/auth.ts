"use server";

import { hash } from "bcryptjs";
import { AuthError } from "next-auth";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signIn, signOut as authSignOut } from "@/auth";
import { emailCopy } from "@/i18n/storefront";
import { isLocale } from "@/i18n/locales";
import { workspaceLocale } from "@/i18n/user-locale";
import { getUserByEmail, getUserById, recordAudit, updateUser } from "@/lib/data";
import { isDemoPersona } from "@/lib/demo-personas";
import { notificationEmail, platformBrand } from "@/lib/email-templates";
import { sendEmail, siteOrigin } from "@/lib/email";
import {
  RESET_LIMITS,
  RESET_LINK_MINUTES,
  allowResetRequest,
  consumeResetToken,
  issueResetToken,
  parseResetToken,
} from "@/lib/password-reset";
import { mintSignInTicket } from "@/lib/sign-in-token";
import { MIN_PASSWORD_LENGTH } from "@/lib/signup";
import type { User } from "@/lib/types";

/** Where a person lands once signed in, by platform role. */
function landingFor(user: User): string {
  return user.platformRole === "platform_admin" ? "/admin" : "/app";
}

export async function signOut(): Promise<void> {
  await authSignOut({ redirectTo: "/login" });
}

/** Starts a session for a user id — used after an invitation is accepted. */
export async function signInUser(userId: string): Promise<void> {
  const user = await getUserById(userId);
  if (!user) redirect("/login?error=unknown-user");
  // The caller redirects into the store itself, so only the cookie is wanted here.
  await signIn("ticket", { ticket: await mintSignInTicket(user.id), redirect: false });
}

/** One-click sign-in used by the demo persona list on the login screen. */
export async function signInAs(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  if (!isDemoPersona(email)) redirect("/login?error=unknown-user");
  const user = await getUserByEmail(email);
  if (!user) redirect("/login?error=unknown-user");

  try {
    await signIn("persona", { email: user.email, redirectTo: landingFor(user) });
  } catch (error) {
    if (error instanceof AuthError) redirect("/login?error=unknown-user");
    throw error;
  }
}

/** Email and password sign-in, checked against the bcrypt hash on the user record. */
export async function signInWithPassword(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    await signIn("password", { email, password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) redirect("/login?error=bad-credentials");
    throw error;
  }

  const user = await getUserByEmail(email);
  redirect(user ? landingFor(user) : "/app");
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * "Forgot password?": emails a reset link when the address has an account, and
 * answers the same way whether it does or not, or when the address or the
 * caller's IP is over its hourly limit.
 */
export async function requestPasswordReset(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) redirect("/login/forgot?error=email");

  const list = await headers();
  const ip = list.get("cf-connecting-ip") ?? list.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const [emailAllowed, ipAllowed] = await Promise.all([
    allowResetRequest(`email:${email}`, RESET_LIMITS.email),
    allowResetRequest(`ip:${ip}`, RESET_LIMITS.ip),
  ]);
  const user = emailAllowed && ipAllowed ? await getUserByEmail(email) : null;

  if (user) {
    const locale = isLocale(user.uiLanguage) ? user.uiLanguage : await workspaceLocale();
    const [token, origin, frame, t] = await Promise.all([
      issueResetToken(user.id),
      siteOrigin(),
      emailCopy(locale),
      getTranslations({ locale, namespace: "auth.resetEmail" }),
    ]);
    sendEmail({
      to: user.email,
      message: notificationEmail(platformBrand(`${origin}/logo.png`), frame, {
        subject: t("subject"),
        heading: t("heading"),
        name: user.name.split(" ")[0] ?? "",
        paragraphs: [t("body", { minutes: RESET_LINK_MINUTES }), t("ignore")],
        action: { label: t("cta"), url: `${origin}/login/reset/${token}` },
      }),
      kind: "password reset",
      agencyId: user.agencyId,
      entity: "user",
      entityId: user.id,
    });
    recordAudit({
      category: "administration",
      action: "user.password_reset_requested",
      summary: `${user.name} asked for a password reset link`,
      agencyId: user.agencyId,
      actorId: user.id,
      actorName: user.name,
      entity: "user",
      entityId: user.id,
      meta: { ip },
    });
  } else if (!emailAllowed || !ipAllowed) {
    recordAudit({
      category: "administration",
      action: "user.password_reset_limited",
      summary: `Password reset requests for ${email} were limited`,
      actorId: "system",
      actorName: "Parcelith",
      meta: { email, ip, limit: emailAllowed ? "ip" : "email" },
    });
  }

  redirect("/login/forgot?sent=1");
}

/**
 * Sets a new password from a reset link, signs the person in and invalidates
 * every other reset link they hold. Also how an account invited before
 * passwords were asked sets its first one.
 */
export async function resetPassword(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  if (!parseResetToken(token)) redirect("/login/forgot");
  const password = String(formData.get("password") ?? "");
  if (password.length < MIN_PASSWORD_LENGTH || password.length > 200) {
    redirect(`/login/reset/${token}?error=password`);
  }

  const userId = await consumeResetToken(token);
  const user = userId ? await getUserById(userId) : null;
  // Used, expired or unknown: the page explains and offers a new link.
  if (!user) redirect(`/login/reset/${token}`);

  await updateUser(user.id, { password: await hash(password, 10) });
  recordAudit({
    category: "administration",
    action: "user.password_reset",
    summary: `${user.name} reset their password`,
    agencyId: user.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "user",
    entityId: user.id,
  });

  await signIn("ticket", { ticket: await mintSignInTicket(user.id), redirect: false });
  redirect(landingFor(user));
}

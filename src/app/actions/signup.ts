"use server";

import { hash } from "bcryptjs";
import { AuthError } from "next-auth";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { asLocale } from "@/i18n/metadata";
import { TRIAL_DAYS, billingConfigured, billingPending } from "@/lib/billing";
import { COLLECTIONS, getAgency, getUserByEmail, recordAudit } from "@/lib/data";
import { siteOrigin } from "@/lib/email";
import { db } from "@/lib/mongo";
import { checkoutLink, startPayment } from "@/lib/operations/billing";
import { getSessionUser } from "@/lib/session";
import { PLANS } from "@/lib/plans";
import { checkSignup } from "@/lib/signup";
import type { Agency, AgencyBilling, User } from "@/lib/types";
import { newId, slugify } from "@/lib/util";
import type { ActionState } from "./stores";

type BillingAgency = Agency & { billing: AgencyBilling };

/**
 * Where to send the owner to pay: the Stripe Checkout page, or the workspace's
 * billing page with a notice when Checkout cannot be opened.
 */
async function checkoutAddress(agency: BillingAgency, email: string, locale: string): Promise<string> {
  return (await checkoutLink(agency, email, await siteOrigin(), locale)) ?? "/app/billing?error=unavailable";
}

/**
 * Creates an agency with its owner on a free trial of the plan chosen on the
 * pricing page, signs the owner in and opens the workspace. No card is asked
 * for: the owner adds payment details from the billing page, at the latest
 * when the trial ends.
 *
 * The form carries one key per filled-in form. A second submission with the
 * same key and password finds the account it already made and signs in to it,
 * rather than failing on the email address it just took.
 *
 * Without a billing key no account is made, since a trial could never be paid
 * for: the sign-up page sends visitors to sales then, and this only answers a
 * form left open from before.
 */
export async function createAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const locale = asLocale(String(formData.get("locale") ?? ""));
  const t = await getTranslations({ locale, namespace: "signup.errors" });
  if (!billingConfigured()) return { status: "error", message: t("unavailable"), field: "form" };
  const checked = checkSignup({
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    agencyName: String(formData.get("agencyName") ?? ""),
    password: String(formData.get("password") ?? ""),
    plan: String(formData.get("plan") ?? ""),
    cycle: String(formData.get("cycle") ?? ""),
    currency: String(formData.get("currency") ?? ""),
    submissionKey: String(formData.get("submissionKey") ?? ""),
  });
  if (!checked.ok) return { status: "error", message: t(checked.field), field: checked.field };
  const input = checked.value;

  let agency: Agency | null;
  const existing = await getUserByEmail(input.email);
  if (existing) {
    if (!existing.signupKey || existing.signupKey !== input.submissionKey || !existing.agencyId) {
      return { status: "error", message: t("emailTaken"), field: "email" };
    }
    agency = await getAgency(existing.agencyId);
  } else {
    const now = new Date().toISOString();
    let slug = slugify(input.agencyName) || "agency";
    if (await db.findOne(COLLECTIONS.agencies, { slug })) slug = `${slug}-${newId("x").slice(2, 6)}`;
    agency = {
      id: newId("agy"),
      name: input.agencyName,
      slug,
      plan: input.plan,
      contactEmail: input.email,
      status: "active",
      createdAt: now,
      billing: {
        status: "trialing",
        plan: input.plan,
        cycle: input.cycle,
        currency: input.currency,
        checkoutSessionId: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        activatedAt: null,
        trialEndsAt: new Date(Date.parse(now) + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      },
      signupKey: input.submissionKey,
    };
    const user: User = {
      id: newId("usr"),
      email: input.email,
      name: input.name,
      password: await hash(input.password, 10),
      platformRole: "agency_admin",
      agencyId: agency.id,
      title: "Owner",
      createdAt: now,
      uiLanguage: locale,
      signupKey: input.submissionKey,
    };
    await db.insertOne(COLLECTIONS.agencies, agency as unknown as Record<string, unknown>);
    await db.insertOne(COLLECTIONS.users, user as unknown as Record<string, unknown>);
    recordAudit({
      category: "administration",
      action: "agency.signed_up",
      summary: `${user.name} created the agency “${agency.name}” on a ${TRIAL_DAYS}-day ${PLANS[input.plan].name} trial`,
      agencyId: agency.id,
      actorId: user.id,
      actorName: user.name,
      entity: "agency",
      entityId: agency.id,
      meta: { plan: input.plan, cycle: input.cycle, currency: input.currency },
    });
  }
  if (!agency?.billing) return { status: "error", message: t("form"), field: "form" };

  try {
    await signIn("password", { email: input.email, password: input.password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) return { status: "error", message: t("emailTaken"), field: "email" };
    throw error;
  }

  // A card-first sign-up from before the trial still finishes its checkout.
  if (billingPending(agency)) redirect(await checkoutAddress(agency as BillingAgency, input.email, locale));
  redirect("/app/stores/new?welcome=1");
}

/**
 * "Add payment details" on the billing page, during or after the free trial, or
 * for an owner who left Checkout. During the trial the owner can also switch
 * between the self-serve plans; the trial carries on with the plan chosen,
 * unless it allows fewer live stores than the agency already runs.
 */
export async function continueToPayment(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const agency = user.agencyId ? await getAgency(user.agencyId) : null;
  if (user.platformRole !== "agency_admin" || !agency) redirect("/app");
  const result = await startPayment(
    agency,
    user,
    { cycle: String(formData.get("cycle") ?? ""), plan: String(formData.get("plan") ?? "") },
    await siteOrigin(),
    user.uiLanguage ?? (await getLocale()),
  );
  if (result.status === "not_needed") redirect("/app");
  redirect(result.status === "ready" ? result.url : "/app/billing?error=unavailable");
}

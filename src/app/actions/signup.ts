"use server";

import { hash } from "bcryptjs";
import { AuthError } from "next-auth";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { asLocale } from "@/i18n/metadata";
import { billingPending, startPlanCheckout } from "@/lib/billing";
import { COLLECTIONS, getAgency, getUserByEmail, recordAudit } from "@/lib/data";
import { siteOrigin } from "@/lib/email";
import { db } from "@/lib/mongo";
import { getSessionUser } from "@/lib/session";
import { checkSignup, isBillingCycle } from "@/lib/signup";
import type { Agency, AgencyBilling, User } from "@/lib/types";
import { newId, slugify } from "@/lib/util";
import type { ActionState } from "./stores";

type BillingAgency = Agency & { billing: AgencyBilling };

/**
 * Where to send the owner to pay: the Stripe Checkout page, or the workspace's
 * billing page with a notice when Checkout cannot be opened.
 */
async function checkoutAddress(agency: BillingAgency, email: string, locale: string): Promise<string> {
  const session = await startPlanCheckout({ agency, email, origin: await siteOrigin(), locale });
  if (!session?.url) return "/app/billing?error=unavailable";
  await db.updateOne(COLLECTIONS.agencies, { id: agency.id }, { $set: { "billing.checkoutSessionId": session.id } });
  return session.url;
}

/**
 * Creates an agency with its owner, signs the owner in and opens Checkout for
 * the plan chosen on the pricing page.
 *
 * The form carries one key per filled-in form. A second submission with the
 * same key and password finds the account it already made and goes on to
 * Checkout, rather than failing on the email address it just took.
 */
export async function createAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const locale = asLocale(String(formData.get("locale") ?? ""));
  const t = await getTranslations({ locale, namespace: "signup.errors" });
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
        status: "pending",
        plan: input.plan,
        cycle: input.cycle,
        currency: input.currency,
        checkoutSessionId: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        activatedAt: null,
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
      summary: `${user.name} created the agency “${agency.name}” on the ${input.plan} plan`,
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

  if (!billingPending(agency)) redirect("/app");
  redirect(await checkoutAddress(agency as BillingAgency, input.email, locale));
}

/** "Continue to payment" on the billing page, for an owner who left Checkout or could not reach it. */
export async function continueToPayment(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const agency = user.agencyId ? await getAgency(user.agencyId) : null;
  if (user.platformRole !== "agency_admin" || !agency?.billing || !billingPending(agency)) redirect("/app");

  const cycle = String(formData.get("cycle") ?? "");
  let billing = agency.billing;
  if (isBillingCycle(cycle) && cycle !== billing.cycle) {
    billing = { ...billing, cycle };
    await db.updateOne(COLLECTIONS.agencies, { id: agency.id }, { $set: { "billing.cycle": cycle } });
  }
  redirect(await checkoutAddress({ ...agency, billing }, user.email, user.uiLanguage ?? (await getLocale())));
}

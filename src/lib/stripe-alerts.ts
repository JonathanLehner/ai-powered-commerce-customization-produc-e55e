import "server-only";
import { getTranslations } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/locales";
import { emailCopy } from "@/i18n/storefront";
import { COLLECTIONS, recordAudit } from "./data";
import { sendEmail, siteOrigin } from "./email";
import { notificationEmail, platformBrand } from "./email-templates";
import { db } from "./mongo";
import type { StripeFailure } from "./stripe";
import type { User } from "./types";

/**
 * A refusal of Parcelith's own Stripe account that only the platform owner can
 * fix, such as an unfinished Connect platform profile. It is kept as one record,
 * shown on the platform admin overview, and emailed to platform admins when it
 * first appears or Stripe's message changes. Creating a Connect account clears
 * it, as does the same call succeeding again.
 */

export type StripeOperation = "create_account" | "onboarding_link" | "read_account" | "checkout";

export interface StripePlatformAlert {
  id: "stripe_platform";
  operation: StripeOperation;
  /** Stripe's own words. */
  message: string;
  dashboardUrl: string;
  storeId: string | null;
  storeName: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}

const ALERT_ID = "stripe_platform";
const CONNECT_SETTINGS = "https://dashboard.stripe.com/settings/connect";

export function currentStripeAlert(): Promise<StripePlatformAlert | null> {
  return db.findOne<StripePlatformAlert>(COLLECTIONS.platformAlerts, { id: ALERT_ID });
}

/** Records a platform failure and tells platform admins. Other kinds of failure are ignored. */
export async function reportStripeFailure(
  failure: StripeFailure,
  context: { operation: StripeOperation; store: { id: string; name: string; agencyId?: string } | null },
): Promise<void> {
  if (failure.kind !== "platform") return;
  try {
    const now = new Date().toISOString();
    const before = await currentStripeAlert();
    const dashboardUrl = failure.dashboardUrl ?? CONNECT_SETTINGS;
    await db.upsertOne(
      COLLECTIONS.platformAlerts,
      { id: ALERT_ID },
      {
        $set: {
          operation: context.operation,
          message: failure.message,
          dashboardUrl,
          storeId: context.store?.id ?? null,
          storeName: context.store?.name ?? null,
          lastSeenAt: now,
        },
        $setOnInsert: { firstSeenAt: now },
      },
    );
    if (before?.message === failure.message) return;

    recordAudit({
      category: "administration",
      action: "platform.stripe_attention",
      summary: `Stripe refused the platform account: ${failure.message}`,
      storeId: context.store?.id ?? null,
      agencyId: context.store?.agencyId ?? null,
      actorId: "system",
      actorName: "Parcelith",
      entity: "platform",
      entityId: ALERT_ID,
      meta: { operation: context.operation, dashboardUrl },
    });

    const origin = await siteOrigin();
    const admins = await db.find<User>(COLLECTIONS.users, { platformRole: "platform_admin" });
    for (const admin of admins) {
      const locale = isLocale(admin.uiLanguage) ? admin.uiLanguage : DEFAULT_LOCALE;
      const [frame, t] = await Promise.all([
        emailCopy(locale),
        getTranslations({ locale, namespace: "admin.stripeAlert" }),
      ]);
      sendEmail({
        to: admin.email,
        message: notificationEmail(platformBrand(origin ? `${origin}/logo.png` : null), frame, {
          subject: t("emailSubject"),
          heading: t("title"),
          name: admin.name,
          paragraphs: [t("emailBody"), failure.message],
          rows: context.store ? [{ label: t("storeLabel"), value: context.store.name }] : [],
          action: { label: t("openDashboard"), url: dashboardUrl },
        }),
        kind: "Stripe platform alert",
        entity: "platform",
        entityId: ALERT_ID,
      });
    }
  } catch (error) {
    // The caller is already answering the failure; a lost alert must not hide it.
    console.error("The Stripe platform alert could not be recorded", error);
  }
}

/** Clears the alert: any one after a Connect account was created, or one raised by `operation`. */
export async function clearStripeAlert(operation?: StripeOperation): Promise<void> {
  try {
    await db.deleteOne(COLLECTIONS.platformAlerts, { id: ALERT_ID, ...(operation ? { operation } : {}) });
  } catch (error) {
    console.error("The Stripe platform alert could not be cleared", error);
  }
}

/**
 * What a store team is told when Stripe refuses: Stripe's own message for the
 * store's details, otherwise one of the two messages `t` holds.
 */
export function stripeFailureText(
  failure: StripeFailure,
  t: (key: "stripeUnavailable" | "stripePlatformAttention") => string,
): string {
  if (failure.kind === "invalid") return failure.message;
  return t(failure.kind === "platform" ? "stripePlatformAttention" : "stripeUnavailable");
}

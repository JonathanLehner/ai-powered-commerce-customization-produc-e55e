import "server-only";
import { getTranslations } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/locales";
import { emailCopy } from "@/i18n/storefront";
import { COLLECTIONS, recordAudit } from "./data";
import { sendEmail } from "./email";
import { notificationEmail, platformBrand } from "./email-templates";
import { db } from "./mongo";
import { STOREFRONT_GRACE_DAYS, storefrontsCloseAt, trialReminderDue, type TrialReminder } from "./trial";
import type { Agency, User } from "./types";

/**
 * Emails the agency owner three days and one day before the free trial ends,
 * and on the day it ends, with a link to add payment details. Run by the
 * scheduler. Each reminder is claimed with a guarded write first, so it goes
 * out once however many runs overlap.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export async function sendDueTrialReminders(origin: string, limit = 25, now = Date.now()): Promise<number> {
  // A link to nowhere is worse than a reminder one run later.
  if (!origin) return 0;
  // Trials ending in the next three days, or ended within the grace period.
  const agencies = await db.find<Agency>(
    COLLECTIONS.agencies,
    {
      "billing.status": "trialing",
      "billing.trialEndsAt": {
        $lte: new Date(now + 3 * DAY_MS).toISOString(),
        $gt: new Date(now - STOREFRONT_GRACE_DAYS * DAY_MS).toISOString(),
      },
    },
    { limit: 200 },
  );
  let sent = 0;
  for (const agency of agencies) {
    const due = trialReminderDue(agency, now);
    if (!due) continue;
    if (await sendTrialReminder(agency, due, origin)) sent += 1;
    if (sent >= limit) break;
  }
  return sent;
}

/** The agency's administrators, or its contact address when it has none. */
async function owners(agency: Agency): Promise<{ email: string; name: string; locale: Locale }[]> {
  const admins = await db.find<User>(COLLECTIONS.users, { agencyId: agency.id, platformRole: "agency_admin" });
  if (admins.length > 0) {
    return admins.map((user) => ({
      email: user.email,
      name: user.name.split(" ")[0] ?? "",
      locale: isLocale(user.uiLanguage) ? user.uiLanguage : DEFAULT_LOCALE,
    }));
  }
  return agency.contactEmail ? [{ email: agency.contactEmail, name: "", locale: DEFAULT_LOCALE }] : [];
}

async function sendTrialReminder(agency: Agency, reminder: TrialReminder, origin: string): Promise<boolean> {
  if (!agency.billing?.trialEndsAt) return false;
  const claimed = await db.updateOne(
    COLLECTIONS.agencies,
    { id: agency.id, "billing.status": "trialing", "billing.trialReminders": { $ne: reminder } },
    { $addToSet: { "billing.trialReminders": reminder } },
  );
  if (claimed.modifiedCount !== 1) return false;

  const billingUrl = `${origin}/app/billing`;
  const logoUrl = `${origin}/logo.png`;
  const trialEndsAt = new Date(agency.billing.trialEndsAt);
  const closesAt = storefrontsCloseAt(agency) ?? trialEndsAt;
  for (const owner of await owners(agency)) {
    const [frame, t] = await Promise.all([
      emailCopy(owner.locale),
      getTranslations({ locale: owner.locale, namespace: "billing.trialEmail" }),
    ]);
    const date = (value: Date) => frame.format.dateTime(value, { dateStyle: "long" });
    const values = { agency: agency.name, ends: date(trialEndsAt), closes: date(closesAt) };
    sendEmail({
      to: owner.email,
      message: notificationEmail(platformBrand(logoUrl), frame, {
        subject: t(`${reminder}.subject`, values),
        heading: t(`${reminder}.heading`, values),
        name: owner.name,
        paragraphs: [t(`${reminder}.body`, values)],
        action: { label: t("cta"), url: billingUrl },
      }),
      kind: "trial reminder",
      agencyId: agency.id,
      entity: "agency",
      entityId: agency.id,
    });
  }
  recordAudit({
    category: "administration",
    action: "agency.trial_reminder",
    summary: `Sent the ${reminder.replace("_", " ")} trial reminder for ${agency.name}`,
    agencyId: agency.id,
    actorId: "system",
    actorName: "Parcelith",
    entity: "agency",
    entityId: agency.id,
    meta: { reminder },
  });
  return true;
}

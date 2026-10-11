import "server-only";
import { getTranslations } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/locales";
import { emailCopy } from "@/i18n/storefront";
import { COLLECTIONS } from "./data";
import { sendEmail, siteOrigin } from "./email";
import { enquiryAlertEmail, enquiryConfirmationEmail } from "./enquiry-emails";
import { planEnquiryLabel } from "./enquiry";
import { db } from "./mongo";
import type { PlanEnquiry, User } from "./types";

/**
 * Who hears about a new enquiry: the addresses in `SALES_INBOX` (comma
 * separated) where it is set, and otherwise every platform administrator.
 */
async function salesRecipients(): Promise<{ email: string; locale: Locale }[]> {
  const inbox = (process.env.SALES_INBOX ?? "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
  if (inbox.length > 0) return inbox.map((email) => ({ email, locale: DEFAULT_LOCALE }));
  const admins = await db.find<User>(COLLECTIONS.users, { platformRole: "platform_admin" });
  return admins.map((user) => ({
    email: user.email,
    locale: isLocale(user.uiLanguage) ? user.uiLanguage : DEFAULT_LOCALE,
  }));
}

/**
 * Confirms a new enquiry to the visitor and alerts the sales inbox. Sent once,
 * when the enquiry is first recorded; a resubmitted form sends nothing.
 */
export async function sendEnquiryEmails(enquiry: PlanEnquiry): Promise<void> {
  const origin = await siteOrigin();
  const logoUrl = origin ? `${origin}/logo.png` : null;
  const planName = planEnquiryLabel(enquiry.plan);
  const locale: Locale = isLocale(enquiry.locale) ? enquiry.locale : DEFAULT_LOCALE;

  const [frame, t] = await Promise.all([
    emailCopy(locale),
    getTranslations({ locale, namespace: "contact.email" }),
  ]);
  sendEmail({
    to: enquiry.email,
    message: enquiryConfirmationEmail(frame, t, enquiry, planName, logoUrl),
    kind: "enquiry confirmation",
    entity: "plan_enquiry",
    entityId: enquiry.id,
  });

  const adminUrl = `${origin}/admin/enquiries/${enquiry.id}`;
  for (const recipient of await salesRecipients()) {
    const [staffFrame, staffT] = await Promise.all([
      emailCopy(recipient.locale),
      getTranslations({ locale: recipient.locale, namespace: "admin.enquiryEmail" }),
    ]);
    sendEmail({
      to: recipient.email,
      message: enquiryAlertEmail(staffFrame, staffT, enquiry, planName, adminUrl, logoUrl),
      kind: "new enquiry alert",
      replyTo: enquiry.email,
      entity: "plan_enquiry",
      entityId: enquiry.id,
    });
  }
}

/**
 * The two emails a plan enquiry sends: the confirmation to the visitor, in the
 * language they wrote in, and the alert to the sales inbox. Pure builders over
 * the caller's translators, so `npm run enquiry-check` renders both in every
 * language.
 */
import { LOCALE_NAMES, isLocale } from "@/i18n/locales";
import { notificationEmail, platformBrand, type BuiltEmail, type EmailCopy } from "./email-templates";
import { UNDECIDED } from "./enquiry";
import type { PlanEnquiry } from "./types";
import type messages from "../../messages/en.json";

type Messages = typeof messages;

/** A next-intl translator for one message group, as far as these builders use it. */
type Translator<Group> = (key: keyof Group & string, values?: Record<string, string | number>) => string;

type Enquiry = Pick<PlanEnquiry, "name" | "email" | "company" | "message" | "plan" | "wantsCall" | "locale" | "currency">;

function planValue(enquiry: Enquiry, planName: string, undecided: string): string {
  return enquiry.plan === UNDECIDED ? undecided : planName;
}

/** To the visitor: what they asked about and when to expect a reply. `t` is `contact.email`. */
export function enquiryConfirmationEmail(
  frame: EmailCopy,
  t: Translator<Messages["contact"]["email"]>,
  enquiry: Enquiry,
  planName: string,
  logoUrl: string | null,
): BuiltEmail {
  const firstName = enquiry.name.split(" ")[0];
  return notificationEmail(platformBrand(logoUrl), frame, {
    subject: t("subject"),
    heading: t("heading"),
    name: firstName,
    paragraphs: [
      t("body", {
        plan: enquiry.plan === UNDECIDED ? UNDECIDED : "named",
        planName,
        call: enquiry.wantsCall ? "yes" : "no",
      }),
    ],
    rows: [
      { label: t("companyLabel"), value: enquiry.company },
      { label: t("planLabel"), value: planValue(enquiry, planName, t("undecided")) },
      { label: t("currencyLabel"), value: enquiry.currency ?? "USD" },
      { label: t("replyLabel"), value: enquiry.wantsCall ? t("replyCall") : t("replyEmail") },
      ...(enquiry.message ? [{ label: t("messageLabel"), value: enquiry.message }] : []),
    ],
  });
}

/** To the sales inbox: the enquiry and a link to it in platform admin. `t` is `admin.enquiryEmail`. */
export function enquiryAlertEmail(
  frame: EmailCopy,
  t: Translator<Messages["admin"]["enquiryEmail"]>,
  enquiry: Enquiry,
  planName: string,
  adminUrl: string,
  logoUrl: string | null,
): BuiltEmail {
  const plan = planValue(enquiry, planName, t("undecided"));
  return notificationEmail(platformBrand(logoUrl), frame, {
    subject: t("subject", { company: enquiry.company, plan }),
    heading: t("heading"),
    name: "",
    paragraphs: [t("body", { name: enquiry.name, company: enquiry.company })],
    rows: [
      { label: t("nameLabel"), value: enquiry.name },
      { label: t("emailLabel"), value: enquiry.email },
      { label: t("companyLabel"), value: enquiry.company },
      { label: t("planLabel"), value: plan },
      { label: t("currencyLabel"), value: enquiry.currency ?? "USD" },
      { label: t("replyLabel"), value: enquiry.wantsCall ? t("replyCall") : t("replyEmail") },
      ...(isLocale(enquiry.locale) ? [{ label: t("languageLabel"), value: LOCALE_NAMES[enquiry.locale] }] : []),
      ...(enquiry.message ? [{ label: t("messageLabel"), value: enquiry.message }] : []),
    ],
    action: { label: t("cta"), url: adminUrl },
  });
}

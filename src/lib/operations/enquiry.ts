import "server-only";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import { createPlanEnquiry, getPlanEnquiryByKey } from "../data";
import { checkEnquiry, type EnquiryInput } from "../enquiry";
import { sendEnquiryEmails } from "../enquiry-notify";
import type { PlanEnquiry } from "../types";

/**
 * A plan enquiry: what someone asked for, confirmed to them by email and
 * alerted to the sales inbox. No account is created and no store is
 * provisioned. The pricing page's form and the Admin API both run this.
 */

export type EnquiryResult =
  | { ok: false; field: string; message: string }
  /** `duplicate` when the same submission key was already recorded. */
  | { ok: true; duplicate: boolean; enquiry: EnquiryInput; record: PlanEnquiry | null };

export async function submitEnquiry(
  raw: Partial<Record<keyof EnquiryInput, string | boolean>>,
  locale: Locale,
): Promise<EnquiryResult> {
  const checked = checkEnquiry(raw);
  if (!checked.ok) {
    const t = await getTranslations({ locale, namespace: "contact" });
    const field = checked.field;
    const message =
      field === "name" || field === "email" || field === "company" || field === "plan" ? t(`errors.${field}`) : checked.message;
    return { ok: false, field, message };
  }
  const enquiry = checked.value;

  // The form key is generated once per filled-in form, so a double click, a slow
  // reply or a retried submission all carry the same one and the enquiry is
  // recorded a single time.
  if (enquiry.submissionKey) {
    const existing = await getPlanEnquiryByKey(enquiry.submissionKey);
    if (existing) return { ok: true, duplicate: true, enquiry, record: existing };
  }

  const record = await createPlanEnquiry({ ...enquiry, locale });
  try {
    await sendEnquiryEmails(record);
  } catch (error) {
    // The enquiry is saved and shows in platform admin either way.
    console.error("[contact] enquiry emails could not be queued", error);
  }
  return { ok: true, duplicate: false, enquiry, record };
}

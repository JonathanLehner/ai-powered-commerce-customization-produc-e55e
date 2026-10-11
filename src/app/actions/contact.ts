"use server";

import { getTranslations } from "next-intl/server";
import { asLocale } from "@/i18n/metadata";
import { createPlanEnquiry, getPlanEnquiryByKey } from "@/lib/data";
import { UNDECIDED, checkEnquiry, planEnquiryLabel } from "@/lib/enquiry";
import { PLAN_KEYS } from "@/lib/plans";
import type { ActionState } from "./stores";

/**
 * The enquiry left by a visitor on the pricing page.
 *
 * It records what someone asked for and nothing else: no account is created and
 * no store is provisioned. The rules that clamp and check the fields live in
 * `lib/enquiry`, which is what `npm run enquiry-check` runs.
 */
export async function submitPlanEnquiry(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const checked = checkEnquiry({
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    company: String(formData.get("company") ?? ""),
    message: String(formData.get("message") ?? ""),
    plan: String(formData.get("plan") ?? ""),
    wantsCall: formData.get("wantsCall") === "on",
    submissionKey: String(formData.get("submissionKey") ?? ""),
  });
  // The page the form was sent from names its language, so the reply is in it too.
  const t = await getTranslations({ locale: asLocale(String(formData.get("locale") ?? "")), namespace: "contact" });
  if (!checked.ok) {
    const field = checked.field;
    const message =
      field === "name" || field === "email" || field === "company" || field === "plan"
        ? t(`errors.${field}`)
        : checked.message;
    return { status: "error", message, field };
  }

  const enquiry = checked.value;
  const firstName = enquiry.name.split(" ")[0];

  // The form key is generated once per filled-in form, so a double click, a slow
  // reply or a retried submission all carry the same one and the enquiry is
  // recorded a single time.
  if (enquiry.submissionKey) {
    const existing = await getPlanEnquiryByKey(enquiry.submissionKey);
    if (existing) {
      return {
        status: "success",
        message: t("duplicate", { name: firstName }),
      };
    }
  }

  await createPlanEnquiry(enquiry);

  return {
    status: "success",
    message: t("received", {
      name: firstName,
      plan: (PLAN_KEYS as readonly string[]).includes(enquiry.plan) ? enquiry.plan : UNDECIDED,
      planName: planEnquiryLabel(enquiry.plan),
      call: enquiry.wantsCall ? "yes" : "no",
    }),
  };
}

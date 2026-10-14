"use server";

import { getTranslations } from "next-intl/server";
import { asLocale } from "@/i18n/metadata";
import { UNDECIDED, planEnquiryLabel } from "@/lib/enquiry";
import { submitEnquiry } from "@/lib/operations/enquiry";
import { PLAN_KEYS } from "@/lib/plans";
import type { ActionState } from "./stores";

/**
 * The enquiry left by a visitor on the pricing page.
 *
 * It records what someone asked for, confirms it to the visitor by email and
 * alerts the sales inbox. No account is created and no store is provisioned. The rules that clamp and check the fields live in
 * `lib/enquiry`, which is what `npm run enquiry-check` runs.
 */
export async function submitPlanEnquiry(_prev: ActionState, formData: FormData): Promise<ActionState> {
  // The page the form was sent from names its language, so the reply is in it too.
  const locale = asLocale(String(formData.get("locale") ?? ""));
  const result = await submitEnquiry(
    {
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      company: String(formData.get("company") ?? ""),
      message: String(formData.get("message") ?? ""),
      plan: String(formData.get("plan") ?? ""),
      currency: String(formData.get("currency") ?? ""),
      wantsCall: formData.get("wantsCall") === "on",
      submissionKey: String(formData.get("submissionKey") ?? ""),
    },
    locale,
  );
  if (!result.ok) return { status: "error", message: result.message, field: result.field };

  const t = await getTranslations({ locale, namespace: "contact" });
  const { enquiry } = result;
  const firstName = enquiry.name.split(" ")[0];
  if (result.duplicate) return { status: "success", message: t("duplicate", { name: firstName }) };
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

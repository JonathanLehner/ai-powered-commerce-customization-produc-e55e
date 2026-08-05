"use server";

import { createPlanEnquiry, getPlanEnquiryByKey } from "@/lib/data";
import { checkEnquiry, planEnquirySentence } from "@/lib/enquiry";
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
  if (!checked.ok) return { status: "error", message: checked.message, field: checked.field };

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
        message: `Thanks ${firstName} — we already have this one. We reply to every enquiry within one working day.`,
      };
    }
  }

  await createPlanEnquiry(enquiry);

  return {
    status: "success",
    message: `Thanks ${firstName}. We have your enquiry about ${planEnquirySentence(enquiry.plan)} and will ${
      enquiry.wantsCall ? "call you" : "email you back"
    } within one working day.`,
  };
}

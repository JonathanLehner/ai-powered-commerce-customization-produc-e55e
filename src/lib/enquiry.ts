/**
 * The plan enquiry left on the public pricing page.
 *
 * The form is open to anyone, so every field is treated as untrusted text:
 * trimmed, clamped to a length that cannot fill a record with a novel, and
 * checked before anything is written. Nothing here touches the database, so the
 * same rules run in `npm run enquiry-check`.
 */

import { PLAN_KEYS, PLANS, type PlanKey } from "./plans";

/** A visitor may name a plan, or say they have not decided. */
export const UNDECIDED = "unsure";

export const PLAN_ENQUIRY_CHOICES: string[] = [...PLAN_KEYS, UNDECIDED];

/** Matches the address checks used elsewhere in the workspace. */
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const LIMITS = { name: 120, email: 160, company: 160, message: 2000, submissionKey: 40 } as const;

export interface EnquiryInput {
  name: string;
  email: string;
  company: string;
  message: string;
  plan: string;
  wantsCall: boolean;
  submissionKey: string;
}

export type EnquiryCheck =
  | { ok: true; value: EnquiryInput }
  | { ok: false; field: keyof EnquiryInput; message: string };

function clamp(value: string, max: number): string {
  return value.trim().slice(0, max);
}

export function checkEnquiry(raw: Partial<Record<keyof EnquiryInput, string | boolean>>): EnquiryCheck {
  const value: EnquiryInput = {
    name: clamp(String(raw.name ?? ""), LIMITS.name),
    email: clamp(String(raw.email ?? ""), LIMITS.email).toLowerCase(),
    company: clamp(String(raw.company ?? ""), LIMITS.company),
    message: clamp(String(raw.message ?? ""), LIMITS.message),
    plan: String(raw.plan ?? "").trim(),
    wantsCall: raw.wantsCall === true || raw.wantsCall === "on",
    submissionKey: clamp(String(raw.submissionKey ?? ""), LIMITS.submissionKey),
  };

  if (value.name.length < 2) return { ok: false, field: "name", message: "Tell us who you are." };
  if (!EMAIL.test(value.email)) {
    return { ok: false, field: "email", message: "Enter an email address we can reply to." };
  }
  if (!value.company) {
    return { ok: false, field: "company", message: "Enter the agency or company this is for." };
  }
  if (!PLAN_ENQUIRY_CHOICES.includes(value.plan)) {
    return { ok: false, field: "plan", message: "Choose which plan this is about." };
  }
  return { ok: true, value };
}

/** How the plan is named back to the visitor and in the platform's sales queue. */
export function planEnquiryLabel(plan: string): string {
  return plan === UNDECIDED || !PLANS[plan as PlanKey] ? "Undecided" : PLANS[plan as PlanKey].name;
}

/** The same plan, written into a sentence the visitor is reading. */
export function planEnquirySentence(plan: string): string {
  return plan === UNDECIDED || !PLANS[plan as PlanKey]
    ? "a plan we can recommend"
    : `the ${PLANS[plan as PlanKey].name} plan`;
}

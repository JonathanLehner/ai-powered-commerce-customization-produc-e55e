import { PLAN_CURRENCIES, type BillingCycle, type PlanCurrency } from "./plans";

/**
 * The sign-up form's rules, kept free of server imports so
 * `npm run signup-check` can run them directly.
 */

/** The plans sold self-serve. Scale goes through sales. */
export const SELF_SERVE_PLANS = ["starter", "studio"] as const;

export type SelfServePlan = (typeof SELF_SERVE_PLANS)[number];

export const MIN_PASSWORD_LENGTH = 8;

/** Starter and Studio start with a free trial with no card; payment details are added from the billing page. */
export const TRIAL_DAYS = 14;

export function isSelfServePlan(value: unknown): value is SelfServePlan {
  return typeof value === "string" && (SELF_SERVE_PLANS as readonly string[]).includes(value);
}

export function isBillingCycle(value: unknown): value is BillingCycle {
  return value === "monthly" || value === "yearly";
}

export interface SignupInput {
  name: string;
  email: string;
  agencyName: string;
  password: string;
  plan: string;
  cycle: string;
  currency: string;
  submissionKey: string;
}

export interface SignupValues {
  name: string;
  email: string;
  agencyName: string;
  password: string;
  plan: SelfServePlan;
  cycle: BillingCycle;
  currency: PlanCurrency;
  submissionKey: string;
}

export type SignupField = "name" | "email" | "agencyName" | "password" | "plan" | "form";

export type SignupCheck = { ok: true; value: SignupValues } | { ok: false; field: SignupField };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function checkSignup(input: SignupInput): SignupCheck {
  const name = input.name.trim().slice(0, 120);
  const email = input.email.trim().toLowerCase().slice(0, 254);
  const agencyName = input.agencyName.trim().slice(0, 120);
  const submissionKey = input.submissionKey.trim();

  if (name.length < 2) return { ok: false, field: "name" };
  if (!EMAIL.test(email)) return { ok: false, field: "email" };
  if (agencyName.length < 2) return { ok: false, field: "agencyName" };
  if (input.password.length < MIN_PASSWORD_LENGTH || input.password.length > 200) {
    return { ok: false, field: "password" };
  }
  if (!isSelfServePlan(input.plan)) return { ok: false, field: "plan" };
  if (!/^sgn_[a-z0-9]{12}$/.test(submissionKey)) return { ok: false, field: "form" };

  return {
    ok: true,
    value: {
      name,
      email,
      agencyName,
      password: input.password,
      plan: input.plan,
      cycle: isBillingCycle(input.cycle) ? input.cycle : "monthly",
      currency: (PLAN_CURRENCIES as readonly string[]).includes(input.currency)
        ? (input.currency as PlanCurrency)
        : "USD",
      submissionKey,
    },
  };
}

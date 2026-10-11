import "server-only";
import { PLANS, planPrice } from "./plans";
import { TRIAL_DAYS } from "./signup";
import type { Agency, AgencyBilling } from "./types";

/**
 * Self-serve plan billing through Stripe Checkout, on Parcelith's own Stripe
 * account (STRIPE_SECRET_KEY). This is separate from `lib/stripe`, which
 * charges shoppers on each store's connected account.
 *
 * Checkout is reached over Stripe's REST API with `fetch`, which runs the same
 * in Node and on Workers.
 */

const STRIPE_API = "https://api.stripe.com/v1";

export { TRIAL_DAYS };

/** Languages Stripe Checkout is shown in; it accepts all nine of the workspace's. */
const CHECKOUT_LOCALES = ["en", "de", "fr", "es", "it", "nl", "pt", "ja", "sv"];

/** True while a self-serve agency has not finished checkout. Platform-managed agencies are never pending. */
export function billingPending(agency: Agency | null): boolean {
  return agency?.billing?.status === "pending";
}

function secretKey(): string | null {
  return process.env.STRIPE_SECRET_KEY || null;
}

async function stripe<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: URLSearchParams; idempotencyKey?: string },
): Promise<T | null> {
  const key = secretKey();
  if (!key) {
    console.error("STRIPE_SECRET_KEY is not set; plan checkout is unavailable.");
    return null;
  }
  try {
    const response = await fetch(`${STRIPE_API}${path}`, {
      method: init.method,
      headers: {
        authorization: `Bearer ${key}`,
        ...(init.body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
        ...(init.idempotencyKey ? { "idempotency-key": init.idempotencyKey } : {}),
      },
      body: init.body,
    });
    const payload = (await response.json()) as T & { error?: { message?: string } };
    if (!response.ok) {
      console.error(`Stripe ${init.method} ${path} failed`, response.status, payload.error?.message);
      return null;
    }
    return payload;
  } catch (error) {
    console.error(`Stripe ${init.method} ${path} failed`, error);
    return null;
  }
}

interface CheckoutSession {
  id: string;
  url: string | null;
  status: "open" | "complete" | "expired";
  client_reference_id: string | null;
  customer: string | null;
  subscription: string | null;
}

/**
 * A Checkout session for the agency's chosen plan, cycle and currency, or null
 * when Stripe cannot be reached. The idempotency key covers that combination,
 * so a double submission or a return from the cancel page within a day opens
 * the same session instead of a second one.
 */
export async function startPlanCheckout(input: {
  agency: Agency & { billing: AgencyBilling };
  email: string;
  origin: string;
  locale: string;
}): Promise<CheckoutSession | null> {
  const { agency, email, origin, locale } = input;
  const { plan: planKey, cycle, currency } = agency.billing;
  const plan = PLANS[planKey];
  const price = planPrice(plan, cycle, currency);
  if (!price) return null;

  const body = new URLSearchParams({
    mode: "subscription",
    customer_email: email,
    client_reference_id: agency.id,
    locale: CHECKOUT_LOCALES.includes(locale) ? locale : "auto",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": currency.toLowerCase(),
    "line_items[0][price_data][unit_amount]": String(price.billed * 100),
    "line_items[0][price_data][recurring][interval]": cycle === "yearly" ? "year" : "month",
    "line_items[0][price_data][product_data][name]": `Parcelith ${plan.name}`,
    "subscription_data[trial_period_days]": String(TRIAL_DAYS),
    "subscription_data[metadata][agencyId]": agency.id,
    "metadata[agencyId]": agency.id,
    "metadata[plan]": planKey,
    "metadata[cycle]": cycle,
    success_url: `${origin}/app/billing/complete?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/app/billing?cancelled=1`,
  });
  return stripe<CheckoutSession>("/checkout/sessions", {
    method: "POST",
    body,
    idempotencyKey: `plan-checkout-${agency.id}-${planKey}-${cycle}-${currency}`,
  });
}

/** A Checkout session as Stripe holds it, to confirm a return from the success page. */
export function getCheckoutSession(id: string): Promise<CheckoutSession | null> {
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return Promise.resolve(null);
  return stripe<CheckoutSession>(`/checkout/sessions/${id}`, { method: "GET" });
}

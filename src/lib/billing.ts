import "server-only";
import Stripe from "stripe";
import { billingConfigured } from "./billing-config";
import { PLANS, planPrice } from "./plans";
import { TRIAL_DAYS } from "./signup";
import type { Agency, AgencyBilling } from "./types";

/**
 * Self-serve plan billing through Stripe Checkout, on Parcelith's own Stripe
 * account (STRIPE_SECRET_KEY). This is separate from `lib/stripe`, which
 * charges shoppers on each store's connected account.
 *
 * The client uses the SDK's fetch transport and Web Crypto, which run the same
 * in Node and on Workers.
 */

export { TRIAL_DAYS, billingConfigured };

/** Languages Stripe Checkout is shown in; it accepts all nine of the workspace's. */
const CHECKOUT_LOCALES: Stripe.Checkout.SessionCreateParams.Locale[] = ["en", "de", "fr", "es", "it", "nl", "pt", "ja", "sv"];

/** True while a self-serve agency has not finished checkout. Platform-managed agencies are never pending. */
export function billingPending(agency: Agency | null): boolean {
  return agency?.billing?.status === "pending";
}

/** A client for this request, or null when no key is configured. Built per call, since the key is only readable once a request is in flight. */
function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("STRIPE_SECRET_KEY is not set; plan checkout is unavailable.");
    return null;
  }
  return new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
}

const cryptoProvider = Stripe.createSubtleCryptoProvider();

interface CheckoutSession {
  id: string;
  url: string | null;
  status: Stripe.Checkout.Session.Status | null;
  client_reference_id: string | null;
  customer: string | null;
  subscription: string | null;
}

/** The fields the sign-up flow keeps, with expandable references reduced to their ids. */
function summarize(session: Stripe.Checkout.Session): CheckoutSession {
  const id = (ref: string | { id: string } | null) => (typeof ref === "string" ? ref : (ref?.id ?? null));
  return {
    id: session.id,
    url: session.url,
    status: session.status,
    client_reference_id: session.client_reference_id,
    customer: id(session.customer),
    subscription: id(session.subscription),
  };
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
  const stripe = stripeClient();
  if (!price || !stripe) return null;

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    customer_email: email,
    client_reference_id: agency.id,
    locale: CHECKOUT_LOCALES.find((code) => code === locale) ?? "auto",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: currency.toLowerCase(),
          unit_amount: price.billed * 100,
          recurring: { interval: cycle === "yearly" ? "year" : "month" },
          product_data: { name: `Parcelith ${plan.name}` },
        },
      },
    ],
    subscription_data: { trial_period_days: TRIAL_DAYS, metadata: { agencyId: agency.id } },
    metadata: { agencyId: agency.id, plan: planKey, cycle },
    success_url: `${origin}/app/billing/complete?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/app/billing?cancelled=1`,
  };
  try {
    const session = await stripe.checkout.sessions.create(params, {
      idempotencyKey: `plan-checkout-${agency.id}-${planKey}-${cycle}-${currency}`,
    });
    return summarize(session);
  } catch (error) {
    console.error("Stripe Checkout session could not be created", error);
    return null;
  }
}

/** A Checkout session as Stripe holds it, to confirm a return from the success page. */
export async function getCheckoutSession(id: string): Promise<CheckoutSession | null> {
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return null;
  const stripe = stripeClient();
  if (!stripe) return null;
  try {
    return summarize(await stripe.checkout.sessions.retrieve(id));
  } catch (error) {
    console.error(`Stripe Checkout session ${id} could not be read`, error);
    return null;
  }
}

/**
 * A webhook event from Parcelith's Stripe account, verified against
 * STRIPE_WEBHOOK_SECRET with Web Crypto, or null when the signature does not
 * check out or billing is not configured. `payload` is the raw request body.
 */
export async function billingWebhookEvent(payload: string, signature: string | null): Promise<Stripe.Event | null> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripe = stripeClient();
  if (!secret || !signature || !stripe) return null;
  try {
    return await stripe.webhooks.constructEventAsync(payload, signature, secret, undefined, cryptoProvider);
  } catch (error) {
    console.error("Stripe webhook signature check failed", error);
    return null;
  }
}

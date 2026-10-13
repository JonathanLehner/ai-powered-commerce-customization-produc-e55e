import "server-only";
import type Stripe from "stripe";
import { billingConfigured } from "./billing-config";
import { COLLECTIONS, recordAudit } from "./data";
import { db } from "./mongo";
import { PLANS, planPrice } from "./plans";
import { TRIAL_DAYS } from "./signup";
import { checkoutLocale, refId, stripeClient } from "./stripe";
import type { Agency, AgencyBilling } from "./types";

/**
 * Self-serve plan billing through Stripe Checkout, on Parcelith's own Stripe
 * account (STRIPE_SECRET_KEY). Storefront payments run on each store's
 * connected account instead; see `lib/stripe.ts`.
 */

export { TRIAL_DAYS, billingConfigured };

const DAY_MS = 24 * 60 * 60 * 1000;

/** True while the agency is on its free trial without payment details, whether or not the trial has ended. */
export function onTrial(agency: Agency | null): boolean {
  return agency?.billing?.status === "trialing";
}

/** Whole days left on the free trial, rounded up; 0 once it has ended. */
export function trialDaysLeft(agency: Agency | null, now = Date.now()): number {
  const ends = agency?.billing?.trialEndsAt ? Date.parse(agency.billing.trialEndsAt) : NaN;
  if (!onTrial(agency) || Number.isNaN(ends)) return 0;
  return Math.max(0, Math.ceil((ends - now) / DAY_MS));
}

/**
 * True while a self-serve agency has to add payment details before it can go
 * on: its free trial has ended, or it signed up card-first and never finished
 * checkout. Platform-managed agencies never are.
 */
export function billingPending(agency: Agency | null): boolean {
  if (agency?.billing?.status === "pending") return true;
  return onTrial(agency) && trialDaysLeft(agency) === 0;
}

/** Whether the owner can open Checkout: on a trial, after it, or still pending. */
export function canStartCheckout(agency: Agency | null): boolean {
  return agency?.billing?.status === "pending" || onTrial(agency);
}

/**
 * The trial Checkout gives the subscription. A trialing agency keeps the days
 * it has left, so adding a card early never resets the clock; Stripe needs a
 * trial end at least two days out, and anything shorter bills straight away.
 * A card-first sign-up still gets the full trial.
 */
function checkoutTrial(billing: AgencyBilling, now = Date.now()): Partial<Pick<Stripe.Checkout.SessionCreateParams.SubscriptionData, "trial_end" | "trial_period_days">> {
  if (billing.status === "pending") return { trial_period_days: TRIAL_DAYS };
  const ends = billing.trialEndsAt ? Date.parse(billing.trialEndsAt) : NaN;
  if (Number.isNaN(ends) || ends - now < 2 * DAY_MS + 60 * 60 * 1000) return {};
  return { trial_end: Math.floor(ends / 1000) };
}

interface CheckoutSession {
  id: string;
  url: string | null;
  status: Stripe.Checkout.Session.Status | null;
  client_reference_id: string | null;
  customer: string | null;
  subscription: string | null;
}

/** The fields the sign-up flow keeps, with expandable references reduced to their ids. */
export function summarize(session: Stripe.Checkout.Session): CheckoutSession {
  return {
    id: session.id,
    url: session.url,
    status: session.status,
    client_reference_id: session.client_reference_id,
    customer: refId(session.customer),
    subscription: refId(session.subscription),
  };
}

/**
 * A Checkout session for the agency's chosen plan, cycle and currency, or null
 * when Stripe cannot be reached. The idempotency key covers that combination,
 * and trial, so a double submission or a return from the cancel page within a
 * day opens the same session instead of a second one.
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
  const trial = checkoutTrial(agency.billing);

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    customer_email: email,
    client_reference_id: agency.id,
    locale: checkoutLocale(locale),
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
    subscription_data: { ...trial, metadata: { agencyId: agency.id } },
    metadata: { agencyId: agency.id, plan: planKey, cycle },
    success_url: `${origin}/app/billing/complete?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/app/billing?cancelled=1`,
  };
  try {
    const session = await stripe.checkout.sessions.create(params, {
      idempotencyKey: `plan-checkout-${agency.id}-${planKey}-${cycle}-${currency}-${trial.trial_end ?? trial.trial_period_days ?? "none"}`,
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
 * Switches the plan on once Checkout completed. Reached from the success page
 * and from the webhook, whichever is first; the write only applies while the
 * agency is still trialing or pending, so the second one changes nothing.
 */
export async function activateSubscription(
  agency: Agency & { billing: AgencyBilling },
  session: CheckoutSession,
  actor: { id: string; name: string },
): Promise<void> {
  const result = await db.updateOne(
    COLLECTIONS.agencies,
    { id: agency.id, "billing.status": { $in: ["trialing", "pending"] } },
    {
      $set: {
        plan: agency.billing.plan,
        "billing.status": "active",
        "billing.checkoutSessionId": session.id,
        "billing.stripeCustomerId": session.customer,
        "billing.stripeSubscriptionId": session.subscription,
        "billing.activatedAt": new Date().toISOString(),
      },
    },
  );
  if (result.modifiedCount === 0) return;
  recordAudit({
    category: "administration",
    action: "agency.subscribed",
    summary: `Subscribed ${agency.name} to the ${agency.billing.plan} plan, billed ${agency.billing.cycle}`,
    agencyId: agency.id,
    actorId: actor.id,
    actorName: actor.name,
    entity: "agency",
    entityId: agency.id,
    meta: { plan: agency.billing.plan, cycle: agency.billing.cycle, currency: agency.billing.currency },
  });
}

/** The workspace's view of a Stripe subscription status. Null leaves the agency as it is. */
export function billingStatusFor(status: Stripe.Subscription.Status): AgencyBilling["status"] | null {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return null;
  }
}

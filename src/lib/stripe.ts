import "server-only";
import Stripe from "stripe";

/**
 * Every call Parcelith makes to Stripe, through the official SDK.
 *
 * Plan billing runs on Parcelith's own account. Storefront and gift campaign
 * payments are direct charges on each store's Connect account: the session,
 * the coupon and the refund are created with `stripeAccount`, so the money
 * lands on the store's balance.
 *
 * The client uses the SDK's fetch transport and Web Crypto, which run the same
 * in Node and on Workers. It is built per call: on Workers the key is only
 * readable once a request is in flight.
 */

export function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("STRIPE_SECRET_KEY is not set; Stripe is unavailable.");
    return null;
  }
  return new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
}

const cryptoProvider = Stripe.createSubtleCryptoProvider();

/** Languages Stripe Checkout is shown in; it accepts all nine of Parcelith's. */
const CHECKOUT_LOCALES: Stripe.Checkout.SessionCreateParams.Locale[] = ["en", "de", "fr", "es", "it", "nl", "pt", "ja", "sv"];

export function checkoutLocale(locale: string): Stripe.Checkout.SessionCreateParams.Locale {
  return CHECKOUT_LOCALES.find((code) => code === locale) ?? "auto";
}

/** An expandable reference reduced to its id. */
export function refId(ref: string | { id: string } | null | undefined): string | null {
  return typeof ref === "string" ? ref : (ref?.id ?? null);
}

/* ------------------------------------------------------------ Connect */

export interface ConnectStatus {
  accountId: string;
  country: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}

export function connectStatus(account: Stripe.Account): ConnectStatus {
  return {
    accountId: account.id,
    country: account.country ?? "US",
    chargesEnabled: account.charges_enabled ?? false,
    payoutsEnabled: account.payouts_enabled ?? false,
    detailsSubmitted: account.details_submitted ?? false,
  };
}

/**
 * A new Express account for a store. Keyed on the store and the attempt, so a
 * double click creates one account, while "connect a different account" after
 * a disconnect makes a new one.
 */
export async function createExpressAccount(input: {
  storeId: string;
  country: string;
  email: string | null;
  attempt: string;
}): Promise<ConnectStatus | null> {
  const stripe = stripeClient();
  if (!stripe) return null;
  try {
    const account = await stripe.accounts.create(
      {
        country: input.country,
        ...(input.email ? { email: input.email } : {}),
        controller: {
          stripe_dashboard: { type: "express" },
          fees: { payer: "application" },
          losses: { payments: "application" },
          requirement_collection: "stripe",
        },
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        metadata: { storeId: input.storeId },
      },
      { idempotencyKey: `connect-account-${input.storeId}-${input.attempt}` },
    );
    return connectStatus(account);
  } catch (error) {
    console.error(`Stripe account for store ${input.storeId} could not be created`, error);
    return null;
  }
}

/** Stripe's hosted onboarding for an account. Links are single-use and short-lived, so one is made per visit. */
export async function onboardingLink(accountId: string, refreshUrl: string, returnUrl: string): Promise<string | null> {
  const stripe = stripeClient();
  if (!stripe) return null;
  try {
    const link = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: refreshUrl,
      return_url: returnUrl,
    });
    return link.url;
  } catch (error) {
    console.error(`Onboarding link for ${accountId} could not be created`, error);
    return null;
  }
}

export async function retrieveAccount(accountId: string): Promise<ConnectStatus | null> {
  const stripe = stripeClient();
  if (!stripe) return null;
  try {
    return connectStatus(await stripe.accounts.retrieve(accountId));
  } catch (error) {
    console.error(`Stripe account ${accountId} could not be read`, error);
    return null;
  }
}

/* ------------------------------------------------- shopper Checkout */

export interface CheckoutLine {
  name: string;
  description?: string;
  /** Minor units of the session currency. */
  unitAmount: number;
  quantity: number;
}

export interface ConnectedCheckoutInput {
  accountId: string;
  /** What the session pays for, echoed back on the webhook. */
  metadata: Record<string, string>;
  /** Makes a retry open the same session. */
  idempotencyKey: string;
  currency: string;
  locale: string;
  email: string;
  lines: CheckoutLine[];
  shipping: { label: string; amount: number } | null;
  discount: { code: string; amount: number } | null;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutStart {
  id: string;
  url: string;
}

/**
 * A hosted Checkout Session on a store's connected account, as a direct
 * charge. Prices, shipping and tax come in already worked out, and a discount
 * becomes a single-use coupon on the same account, so the session's total is
 * exactly the order's.
 */
export async function createConnectedCheckout(input: ConnectedCheckoutInput): Promise<CheckoutStart | null> {
  const stripe = stripeClient();
  if (!stripe) return null;
  const options = { stripeAccount: input.accountId };
  const currency = input.currency.toLowerCase();
  try {
    let coupon: string | null = null;
    if (input.discount && input.discount.amount > 0) {
      const created = await stripe.coupons.create(
        {
          amount_off: input.discount.amount,
          currency,
          duration: "once",
          max_redemptions: 1,
          name: input.discount.code.slice(0, 40),
        },
        { ...options, idempotencyKey: `${input.idempotencyKey}-coupon` },
      );
      coupon = created.id;
    }
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        locale: checkoutLocale(input.locale),
        customer_email: input.email,
        client_reference_id: input.metadata.orderId ?? input.metadata.campaignId,
        line_items: input.lines
          .filter((line) => line.quantity > 0 && line.unitAmount > 0)
          .map((line) => ({
            quantity: line.quantity,
            price_data: {
              currency,
              unit_amount: line.unitAmount,
              product_data: {
                name: line.name,
                ...(line.description ? { description: line.description } : {}),
              },
            },
          })),
        ...(input.shipping
          ? {
              shipping_options: [
                {
                  shipping_rate_data: {
                    type: "fixed_amount" as const,
                    display_name: input.shipping.label,
                    fixed_amount: { amount: input.shipping.amount, currency },
                  },
                },
              ],
            }
          : {}),
        ...(coupon ? { discounts: [{ coupon }] } : {}),
        metadata: input.metadata,
        payment_intent_data: { metadata: input.metadata },
        // An abandoned session gives its discount use back within the hour.
        expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
      },
      { ...options, idempotencyKey: input.idempotencyKey },
    );
    if (!session.url) return null;
    return { id: session.id, url: session.url };
  } catch (error) {
    console.error(`Checkout session on ${input.accountId} could not be created`, error);
    return null;
  }
}

/** Closes an open session so it can no longer be paid. False when it already completed or could not be reached. */
export async function expireConnectedCheckout(accountId: string, sessionId: string): Promise<boolean> {
  const stripe = stripeClient();
  if (!stripe) return false;
  try {
    const session = await stripe.checkout.sessions.expire(sessionId, {}, { stripeAccount: accountId });
    return session.status === "expired";
  } catch (error) {
    console.error(`Checkout session ${sessionId} could not be expired`, error);
    return false;
  }
}

/* ------------------------------------------------------------ refunds */

export interface StripeRefundResult {
  ok: boolean;
  refundId: string | null;
  message: string;
}

/** Returns money on the connected account the order was charged on. */
export async function refundOnConnectedAccount(input: {
  accountId: string;
  paymentIntentId: string;
  amount: number;
  idempotencyKey: string;
}): Promise<StripeRefundResult> {
  const stripe = stripeClient();
  if (!stripe) return { ok: false, refundId: null, message: "Refunds are unavailable right now. Try again shortly." };
  try {
    const refund = await stripe.refunds.create(
      { payment_intent: input.paymentIntentId, amount: input.amount },
      { stripeAccount: input.accountId, idempotencyKey: input.idempotencyKey },
    );
    if (refund.status === "failed" || refund.status === "canceled") {
      return { ok: false, refundId: null, message: "Stripe declined the refund." };
    }
    return { ok: true, refundId: refund.id, message: `Refund ${refund.id} ${refund.status ?? "pending"}.` };
  } catch (error) {
    console.error(`Refund on ${input.paymentIntentId} failed`, error);
    const message = error instanceof Stripe.errors.StripeError ? error.message : "The refund could not be issued.";
    return { ok: false, refundId: null, message };
  }
}

/* ----------------------------------------------------- plan billing */

/** A Customer Portal session for the agency's own customer record. */
export async function billingPortalUrl(customerId: string, returnUrl: string): Promise<string | null> {
  const stripe = stripeClient();
  if (!stripe) return null;
  try {
    const session = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
    return session.url;
  } catch (error) {
    console.error(`Customer Portal for ${customerId} could not be opened`, error);
    return null;
  }
}

export interface NextInvoice {
  amountDue: number;
  currency: string;
  /** When Stripe will attempt it. */
  date: string | null;
}

/** The next invoice on the agency's subscription, or null when there is none. */
export async function nextInvoice(customerId: string, subscriptionId: string): Promise<NextInvoice | null> {
  const stripe = stripeClient();
  if (!stripe) return null;
  try {
    const invoice = await stripe.invoices.createPreview({ customer: customerId, subscription: subscriptionId });
    const at = invoice.next_payment_attempt ?? invoice.period_end ?? null;
    return {
      amountDue: invoice.amount_due,
      currency: invoice.currency.toUpperCase(),
      date: at ? new Date(at * 1000).toISOString() : null,
    };
  } catch (error) {
    console.error(`Upcoming invoice for ${subscriptionId} could not be read`, error);
    return null;
  }
}

/* ----------------------------------------------------------- webhooks */

/**
 * A webhook event, verified with Web Crypto against each configured signing
 * secret in turn, or null when none of them checks out. Two destinations
 * deliver to the same endpoint: STRIPE_WEBHOOK_SECRET is the platform
 * destination's secret and STRIPE_CONNECT_WEBHOOK_SECRET the connected-accounts
 * destination's. `payload` is the raw request body.
 */
export async function verifyWebhookEvent(payload: string, signature: string | null): Promise<Stripe.Event | null> {
  const secrets = [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_CONNECT_WEBHOOK_SECRET].filter(
    (secret): secret is string => Boolean(secret),
  );
  const stripe = stripeClient();
  if (secrets.length === 0 || !signature || !stripe) return null;
  for (const secret of secrets) {
    try {
      return await stripe.webhooks.constructEventAsync(payload, signature, secret, undefined, cryptoProvider);
    } catch {
      // Try the next secret; a mismatch on all of them is reported below.
    }
  }
  console.error("Stripe webhook signature check failed");
  return null;
}

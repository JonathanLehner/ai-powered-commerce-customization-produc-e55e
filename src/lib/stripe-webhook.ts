import "server-only";
import type Stripe from "stripe";
import { activateSubscription, billingStatusFor, summarize } from "./billing";
import { applyConnectStatus } from "./connect";
import {
  COLLECTIONS,
  getAgency,
  getGiftCampaign,
  getOrder,
  getStore,
  listShippingZones,
  recordAudit,
  updateGiftCampaign,
} from "./data";
import { raiseCampaignOrders } from "./gift-payment";
import { db } from "./mongo";
import { abandonOrderPayment, confirmOrderPayment, type SettledAmounts } from "./order-payment";
import { checkoutShippingRate, connectStatus, refId, verifyWebhookEvent } from "./stripe";
import type { Agency, AgencyBilling, Order, Store } from "./types";
import { formatMoney } from "./util";

/**
 * POST /api/stripe/webhook.
 *
 * Every event is verified against the signing secret before anything is read
 * from it, and claimed by its id before it is handled: Stripe delivers at least
 * once, so a redelivery finds the claim and is acknowledged without being run
 * again. A handler that throws releases the claim and answers 500, so Stripe's
 * retry gets a clean second attempt.
 */

export interface WebhookResponse {
  status: number;
  body: Record<string, unknown>;
}

const STRIPE_ACTOR = { id: "stripe", name: "Stripe" };

export async function handleStripeWebhook(payload: string, signature: string | null): Promise<WebhookResponse> {
  const event = await verifyWebhookEvent(payload, signature);
  if (!event) return { status: 400, body: { error: "Invalid signature" } };

  const claim = await db.upsertOne(
    COLLECTIONS.stripeEvents,
    { id: event.id },
    {
      $setOnInsert: {
        id: event.id,
        type: event.type,
        account: event.account ?? null,
        receivedAt: new Date().toISOString(),
      },
    },
  );
  if (!claim.upsertedCount) return { status: 200, body: { received: true, duplicate: true } };

  try {
    const outcome = await dispatch(event);
    await db.updateOne(
      COLLECTIONS.stripeEvents,
      { id: event.id },
      { $set: { outcome, processedAt: new Date().toISOString() } },
    );
    return { status: 200, body: { received: true, outcome } };
  } catch (error) {
    console.error(`Stripe event ${event.id} (${event.type}) failed`, error);
    await db.deleteOne(COLLECTIONS.stripeEvents, { id: event.id });
    return { status: 500, body: { error: "Processing failed" } };
  }
}

async function dispatch(event: Stripe.Event): Promise<string> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired":
      return checkoutSession(event.type, event.data.object, event.account ?? null);
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return subscriptionChanged(event.data.object, event.type === "customer.subscription.deleted");
    case "invoice.payment_failed":
      return invoiceFailed(event.data.object);
    case "account.updated":
      return accountUpdated(event.data.object);
    default:
      return "ignored";
  }
}

/* ---------------------------------------------------- Checkout sessions */

type SessionEvent =
  | "checkout.session.completed"
  | "checkout.session.async_payment_succeeded"
  | "checkout.session.async_payment_failed"
  | "checkout.session.expired";

/**
 * What Checkout settled that the order did not know when it was written: the
 * shipping rate, when the shopper picked another one on Checkout, and the tax
 * Stripe Tax calculated. Null when the order already holds the right numbers.
 */
async function settledAmounts(
  order: Order,
  session: Stripe.Checkout.Session,
  account: string,
): Promise<SettledAmounts | null> {
  const amounts: SettledAmounts = {};
  const cost = session.shipping_cost;
  const rateRef = cost ? refId(cost.shipping_rate) : null;
  if (cost && rateRef && order.shippingRate) {
    const metadata = await checkoutShippingRate(account, rateRef);
    if (metadata?.rateId && metadata.rateId !== order.shippingRate.rateId) {
      const zones = await listShippingZones(order.storeId);
      const zone = zones.find((z) => z.id === metadata.zoneId);
      const rate = zone?.rates.find((r) => r.id === metadata.rateId);
      amounts.shipping = cost.amount_subtotal;
      amounts.shippingRate = {
        zoneId: metadata.zoneId ?? order.shippingRate.zoneId,
        zoneName: zone?.name ?? order.shippingRate.zoneName,
        rateId: metadata.rateId,
        name: rate?.name ?? order.shippingRate.name,
        minDays: rate?.minDays ?? 0,
        maxDays: rate?.maxDays ?? 0,
        amount: cost.amount_subtotal,
      };
    }
  }
  if (order.tax?.mode === "stripe") {
    amounts.taxAmount = session.total_details?.amount_tax ?? 0;
    amounts.taxLines = [];
    amounts.taxRate = 0;
  }
  if (Object.keys(amounts).length === 0) return null;
  if (session.amount_total !== null) amounts.total = session.amount_total;
  return amounts;
}

async function checkoutSession(type: SessionEvent, session: Stripe.Checkout.Session, account: string | null) {
  if (session.mode === "subscription") return planCheckout(type, session);
  const kind = session.metadata?.kind;
  if (kind !== "order" && kind !== "gift_campaign") return "ignored";
  // Shopper payments are direct charges, so they only ever arrive as Connect
  // events from the store's own account.
  if (!account) return "ignored_platform_event";

  const paid =
    type === "checkout.session.async_payment_succeeded" ||
    (type === "checkout.session.completed" && session.payment_status === "paid");
  const closed = type === "checkout.session.async_payment_failed" || type === "checkout.session.expired";
  if (!paid && !closed) return "awaiting_async_payment";

  const amount = session.amount_total ?? 0;
  const note = `${formatMoney(amount, (session.currency ?? "usd").toUpperCase())} paid on Stripe Checkout.`;
  const paymentIntentId = refId(session.payment_intent);

  if (kind === "order") {
    const order = await getOrder(session.metadata?.orderId ?? "");
    if (!order || order.payment.stripeAccountId !== account || order.payment.checkoutSessionId !== session.id) {
      return "unknown_order";
    }
    const store = await getStore(order.storeId);
    if (!store) return "unknown_store";
    if (paid) {
      const amounts = await settledAmounts(order, session, account);
      const done = await confirmOrderPayment(order, store, { paymentIntentId, last4: null, note, amounts });
      return done ? "order_paid" : "order_already_settled";
    }
    const done = await abandonOrderPayment(order, store, type === "checkout.session.expired" ? "expired" : "failed");
    return done ? "order_closed" : "order_already_settled";
  }

  const campaign = await getGiftCampaign(session.metadata?.campaignId ?? "");
  if (!campaign || campaign.payment.stripeAccountId !== account || campaign.payment.checkoutSessionId !== session.id) {
    return "unknown_campaign";
  }
  const store = await getStore(campaign.storeId);
  if (!store) return "unknown_store";
  if (paid) {
    const result = await raiseCampaignOrders(campaign, store, {
      paymentIntentId,
      last4: null,
      stripeAccountId: account,
      checkoutSessionId: session.id,
      note,
    });
    return `campaign_${result}`;
  }
  if (type === "checkout.session.async_payment_failed") {
    const now = new Date().toISOString();
    // The session id stays: the buyer's next attempt is keyed on it, so it
    // opens a new session rather than replaying this one.
    await updateGiftCampaign(campaign.id, {
      events: [...campaign.events, { at: now, status: "Payment failed", note: "The payment did not go through.", actor: "Stripe" }],
    });
  }
  return "campaign_unpaid";
}

/* ---------------------------------------------------------- plan billing */

type BilledAgency = Agency & { billing: AgencyBilling };

async function billedAgency(filter: Record<string, unknown>): Promise<BilledAgency | null> {
  const agency = await db.findOne<Agency>(COLLECTIONS.agencies, filter);
  return agency?.billing ? (agency as BilledAgency) : null;
}

async function planCheckout(type: SessionEvent, session: Stripe.Checkout.Session) {
  const agency = await getAgency(session.metadata?.agencyId ?? session.client_reference_id ?? "");
  if (!agency?.billing) return "unknown_agency";
  const billed = agency as BilledAgency;
  if (type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") {
    if (session.status !== "complete") return "awaiting_async_payment";
    await activateSubscription(billed, summarize(session), STRIPE_ACTOR);
    return "plan_activated";
  }
  if (type === "checkout.session.async_payment_failed" && billed.billing.status === "active") {
    await setBillingStatus(billed, "past_due");
    return "plan_past_due";
  }
  return "ignored";
}

async function setBillingStatus(
  agency: BilledAgency,
  status: AgencyBilling["status"],
  extra: Record<string, unknown> = {},
): Promise<void> {
  await db.updateOne(COLLECTIONS.agencies, { id: agency.id }, { $set: { "billing.status": status, ...extra } });
  if (agency.billing.status === status) return;
  recordAudit({
    category: "administration",
    action: `agency.billing_${status}`,
    summary:
      status === "past_due"
        ? `${agency.name}'s plan payment failed; the plan is past due`
        : status === "canceled"
          ? `${agency.name}'s subscription ended`
          : `${agency.name}'s plan is paid up`,
    agencyId: agency.id,
    actorId: STRIPE_ACTOR.id,
    actorName: STRIPE_ACTOR.name,
    entity: "agency",
    entityId: agency.id,
    meta: { from: agency.billing.status, to: status },
  });
}

async function subscriptionChanged(subscription: Stripe.Subscription, deleted: boolean) {
  const agency =
    (subscription.metadata?.agencyId ? await billedAgency({ id: subscription.metadata.agencyId }) : null) ??
    (await billedAgency({ "billing.stripeSubscriptionId": subscription.id }));
  if (!agency) return "unknown_agency";
  // A subscription event can overtake the Checkout one; activation sets the
  // status, and later updates follow it.
  if (agency.billing.status === "pending") return "agency_pending";

  const periodEnd = subscription.items.data[0]?.current_period_end;
  const status = deleted ? "canceled" : (billingStatusFor(subscription.status) ?? agency.billing.status);
  await setBillingStatus(agency, status, {
    "billing.stripeSubscriptionId": subscription.id,
    "billing.cancelAtPeriodEnd": subscription.cancel_at_period_end,
    "billing.currentPeriodEnd": periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
  });
  return `plan_${status}`;
}

async function invoiceFailed(invoice: Stripe.Invoice) {
  const customer = refId(invoice.customer);
  if (!customer) return "unknown_agency";
  const agency = await billedAgency({ "billing.stripeCustomerId": customer });
  if (!agency) return "unknown_agency";
  if (agency.billing.status === "pending") return "agency_pending";
  await setBillingStatus(agency, "past_due");
  return "plan_past_due";
}

/* --------------------------------------------------------------- Connect */

async function accountUpdated(account: Stripe.Account) {
  const store = await db.findOne<Store>(COLLECTIONS.stores, {
    "stripe.accountId": account.id,
    "stripe.express": true,
  });
  if (!store) return "unknown_account";
  await applyConnectStatus(store, connectStatus(account), STRIPE_ACTOR);
  return "store_refreshed";
}

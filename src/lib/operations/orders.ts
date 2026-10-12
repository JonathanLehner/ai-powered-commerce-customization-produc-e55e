import "server-only";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { emailCopy, shopperLocale } from "@/i18n/storefront";
import { localeBase, storeLanguages } from "@/i18n/storefront-routing";
import { refreshCustomers } from "../customer-data";
import { getOrder, recordAudit, updateOrder } from "../data";
import { refundSimulated, type RefundResult } from "../demo-payment";
import { sendEmail, siteOrigin } from "../email";
import { brandFor, shippingNotificationEmail } from "../email-templates";
import { trackingNumberFor } from "../fulfillment";
import { orderStatusUrl, signOrderToken } from "../order-access";
import { refundOnConnectedAccount } from "../stripe";
import { canMoveOrder, type FulfillmentEvent, type Order, type OrderStatus, type Store } from "../types";
import { CARRIER_LABELS, TRACKING_URLS, formatMoney, newId } from "../util";
import { OperationError, type OperationContext } from "./context";

/**
 * Working an order: handing it to the carrier, moving it through its statuses,
 * and refunding it. The workspace's order actions, its bulk actions and the
 * Admin API all run these.
 */

export type Carrier = "dhl" | "fedex" | "ups";
export const CARRIERS: Carrier[] = ["dhl", "fedex", "ups"];

/** The order, provided it belongs to the store. */
export async function findOrder(storeId: string, orderId: string): Promise<Order | null> {
  const order = await getOrder(orderId);
  return order && order.storeId === storeId ? order : null;
}

export function orderEvent(status: string, note: string, actor: string): FulfillmentEvent {
  return { at: new Date().toISOString(), status, note, actor };
}

export function revalidateOrder(storeId: string, orderId: string) {
  revalidatePath(`/app/stores/${storeId}/orders`);
  revalidatePath(`/app/stores/${storeId}/orders/${orderId}`);
}

/* ---------------------------------------------------------------- shipping */

/**
 * Hands one order to the carrier: records the tracking, the audit entry and
 * the shopper's shipping email. With no tracking number given, the carrier's
 * own is used.
 */
export async function shipOrder(
  ctx: OperationContext,
  order: Order,
  carrier: Carrier,
  entered: string,
): Promise<{ trackingNumber: string; trackingUrl: string }> {
  const { store, actor } = ctx;
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.orders" });
  if (!CARRIERS.includes(carrier)) throw new OperationError("invalid", t("chooseCarrier"), "carrier");
  const enabled = store.carriers.find((c) => c.carrier === carrier && c.enabled);
  if (!enabled) {
    throw new OperationError("invalid", t("carrierDisabled", { carrier: CARRIER_LABELS[carrier] }), "carrier");
  }
  const trackingNumber = entered.trim() || trackingNumberFor(carrier, order.code);
  if (trackingNumber.length < 6) {
    throw new OperationError("invalid", t("trackingTooShort"), "trackingNumber");
  }

  const storeId = store.id;
  const trackingUrl = TRACKING_URLS[carrier](trackingNumber);
  await updateOrder(order.id, {
    status: "shipped",
    fulfillment: { ...order.fulfillment, carrier, trackingNumber, trackingUrl },
    events: [
      ...order.events,
      orderEvent("Shipped", `Handed to ${CARRIER_LABELS[carrier]}, tracking ${trackingNumber}.`, actor.name),
    ],
  });
  recordAudit({
    category: "order_routing",
    action: "order.shipped",
    summary: `${order.code} shipped with ${CARRIER_LABELS[carrier]} (${trackingNumber})`,
    storeId,
    agencyId: store.agencyId,
    actorId: actor.id,
    actorName: actor.name,
    entity: "order",
    entityId: order.code,
    meta: { carrier, trackingNumber },
  });

  // The shopper is told their parcel is moving; a mail provider that is down
  // leaves the shipment recorded and the attempt in the store's activity.
  try {
    const origin = await siteOrigin();
    // Written in the language the shopper checked out in, if the store still offers it.
    const locale = shopperLocale(store, order.locale ?? "");
    const base = localeBase(`/s/${store.slug}`, locale, storeLanguages(store).defaultLocale);
    sendEmail({
      to: order.customer.email,
      message: shippingNotificationEmail(brandFor(store), await emailCopy(locale), {
        customerName: order.customer.name,
        code: order.code,
        carrierName: CARRIER_LABELS[carrier],
        trackingNumber,
        trackingUrl,
        statusUrl: `${origin}${orderStatusUrl(base, order.code, await signOrderToken(storeId, order.code))}`,
      }),
      kind: "shipping notification",
      storeId,
      agencyId: store.agencyId,
      entity: "order",
      entityId: order.code,
    });
  } catch (error) {
    console.error("Shipping notification could not be queued", error);
  }

  revalidateOrder(storeId, order.id);
  return { trackingNumber, trackingUrl };
}

/* ---------------------------------------------------------------- statuses */

/** Moves one order to the status asked for; false when the status rules do not allow it. */
export async function moveOrder(ctx: OperationContext, order: Order, status: OrderStatus): Promise<boolean> {
  const { store, actor } = ctx;
  if (!canMoveOrder(order, status)) return false;
  const notes: Partial<Record<OrderStatus, string>> = {
    in_production: "Production started at the supplier.",
    shipped: "Parcel handed to the carrier.",
    delivered: "Delivered to the shopper.",
    cancelled: "Order cancelled by the store team.",
    exception: "Flagged for manual attention.",
    paid: "Returned to the paid queue for re-routing.",
  };

  const patch: Partial<Order> = {
    status,
    events: [...order.events, orderEvent(status.replace("_", " "), notes[status] ?? "", actor.name)],
  };
  if (status !== "exception") {
    patch.fulfillment = { ...order.fulfillment, exception: null };
  }

  await updateOrder(order.id, patch);
  recordAudit({
    category: "order_routing",
    action: `order.${status}`,
    summary: `Set ${order.code} to ${status.replace("_", " ")}`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: actor.id,
    actorName: actor.name,
    entity: "order",
    entityId: order.code,
    meta: { status },
  });
  if (status === "cancelled") refreshCustomers(store, [order.customer.email]);
  revalidateOrder(store.id, order.id);
  return true;
}

/* ----------------------------------------------------------------- refunds */

/**
 * An order paid on Stripe Checkout is refunded through the Refunds API on the
 * connected account it was charged on. Demo-store and older orders never
 * reached Stripe, so their refund is simulated the same way their payment was.
 */
async function refundPayment(store: Store, order: Order, amount: number, idempotencyKey: string): Promise<RefundResult> {
  const { paymentIntentId, stripeAccountId, checkoutSessionId } = order.payment;
  if (!checkoutSessionId) {
    return refundSimulated({ store, paymentIntentId, amount, currency: order.currency, idempotencyKey });
  }
  if (!paymentIntentId || !stripeAccountId) {
    return { ok: false, refundId: null, message: "No captured payment to refund.", code: "no_payment_intent" };
  }
  const result = await refundOnConnectedAccount({ accountId: stripeAccountId, paymentIntentId, amount, idempotencyKey });
  return result.ok ? result : { ...result, code: "gateway_error" };
}

export interface RefundInput {
  /** Minor units of the order currency; null when what was entered is not an amount. */
  amount: number | null;
  reason: string;
  /** Cancel the order as well. */
  cancel: boolean;
}

/**
 * Gives money back on an order, optionally cancelling it. Nothing is recorded
 * unless the payment provider returned the money.
 */
export async function refundOrder(
  ctx: OperationContext,
  order: Order,
  input: RefundInput,
): Promise<{ order: Order; amount: number; refundId: string | null }> {
  const { store, actor } = ctx;
  const reason = input.reason.trim();
  const amount = input.amount;
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.orders" });
  if (amount === null || !Number.isInteger(amount) || amount <= 0) {
    throw new OperationError("invalid", t("amountRequired"), "amount");
  }
  const alreadyRefunded = order.refunds.reduce((sum, r) => sum + r.amount, 0);
  if (amount + alreadyRefunded > order.total) {
    throw new OperationError(
      "invalid",
      t("overTotal", { total: formatMoney(order.total, order.currency, ctx.locale) }),
      "amount",
    );
  }
  if (reason.length < 4) throw new OperationError("invalid", t("reasonRequired"), "reason");
  if (order.payment.status !== "succeeded" && order.payment.status !== "refunded") {
    throw new OperationError("conflict", t("noPayment"));
  }

  // Money first: nothing is recorded unless the gateway actually returned it.
  // The key makes a double submit land as one refund at the gateway too: the
  // already-refunded total is part of it, so a genuine second refund differs.
  const gateway = await refundPayment(store, order, amount, `${order.id}:${alreadyRefunded}:${amount}`);
  if (!gateway.ok) {
    const message =
      gateway.code === "account_not_ready"
        ? t("accountNotReady")
        : gateway.code === "no_payment_intent"
          ? t("noPayment")
          : gateway.code === "invalid_amount"
            ? t("amountRequired")
            : gateway.code === "currency_unsupported"
              ? t("currencyUnsupported", { currency: order.currency })
              : gateway.code === "gateway_error"
                ? t("refundFailed")
                : gateway.message;
    throw new OperationError("payment_failed", message);
  }

  const refunds = [
    ...order.refunds,
    {
      id: newId("ref"),
      amount,
      reason,
      at: new Date().toISOString(),
      actor: actor.name,
      gatewayRefundId: gateway.refundId ?? undefined,
    },
  ];
  const fullyRefunded = refunds.reduce((sum, r) => sum + r.amount, 0) >= order.total;
  const patch: Partial<Order> = {
    refunds,
    status: input.cancel ? "cancelled" : order.status,
    payment: { ...order.payment, status: fullyRefunded ? "refunded" : order.payment.status },
    events: [
      ...order.events,
      orderEvent(
        input.cancel ? "Cancelled and refunded" : "Refund issued",
        `${formatMoney(amount, order.currency)} refunded (${gateway.refundId}): ${reason}`,
        actor.name,
      ),
    ],
  };

  const written = await updateOrder(order.id, patch, { updatedAt: order.updatedAt });
  if (!written) {
    // The order moved under us. The gateway call was idempotent, so the refund
    // that did land is already on the reloaded order.
    revalidateOrder(store.id, order.id);
    throw new OperationError("conflict", t("orderChanged"));
  }
  recordAudit({
    category: "order_routing",
    action: input.cancel ? "order.cancelled_refunded" : "order.refunded",
    summary: `${input.cancel ? "Cancelled and refunded" : "Refunded"} ${formatMoney(amount, order.currency)} on ${order.code}: ${reason}`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: actor.id,
    actorName: actor.name,
    entity: "order",
    entityId: order.code,
    meta: { amount, reason, gatewayRefundId: gateway.refundId },
    notify: {
      type: "refund_recorded",
      href: `/app/stores/${store.id}/orders/${order.id}`,
      params: { code: order.code, amount, currency: order.currency },
    },
  });
  refreshCustomers(store, [order.customer.email]);
  revalidateOrder(store.id, order.id);
  return { order: { ...order, ...patch }, amount, refundId: gateway.refundId };
}

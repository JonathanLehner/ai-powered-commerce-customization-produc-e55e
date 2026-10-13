import "server-only";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { emailCopy, shopperLocale } from "@/i18n/storefront";
import { storeLinkBase } from "@/lib/seo";
import { BULK_STATUSES, moveBlock, parseOrderIds, routeBlock, shipBlock, type BulkBlock, type BulkStatus } from "../bulk-orders";
import { refreshCustomers } from "../customer-data";
import { getOrder, getStoreOrders, getSupplier, recordAudit, updateOrder, updateStore } from "../data";
import { refundSimulated, type RefundResult } from "../demo-payment";
import { sendEmail, siteOrigin } from "../email";
import { brandFor, shippingNotificationEmail } from "../email-templates";
import { routeOrder, submitToSupplier, trackingNumberFor, type RoutingDecision } from "../fulfillment";
import { releaseOrderStock, restockOrder } from "../inventory";
import { orderStatusUrl, signOrderToken } from "../order-access";
import { refundOnConnectedAccount } from "../stripe";
import { giftCardLineIds } from "../gift-card-data";
import {
  MAX_NOTE_LENGTH,
  MAX_TAGS,
  canEditAddress,
  canShip,
  normaliseTags,
  planShipment,
  RECOVERY_DELAY_MAX,
  RECOVERY_DELAY_MIN,
  readAddress,
  readDelayHours,
  recoverySettings,
  remainingQuantities,
  type AddressInput,
} from "../order-ops";
import { emitOrderWebhook } from "../webhook-events";
import {
  canMoveOrder,
  type CheckoutRecoverySettings,
  type FulfillmentEvent,
  type Order,
  type OrderShipment,
  type OrderStatus,
  type Store,
} from "../types";
import { CARRIER_LABELS, TRACKING_URLS, formatMoney, newId } from "../util";
import { OperationError, isOperationError, type OperationContext } from "./context";

/**
 * Working an order: sending it to a supplier, handing it to the carrier,
 * moving it through its statuses, flagging problems, and refunding it. The workspace's order actions, its bulk actions and the
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

export interface ShipmentInput {
  carrier: Carrier;
  /** Blank uses the carrier's own number. */
  trackingNumber: string;
  /** The units in this parcel; null ships everything still to ship. */
  lines: { itemId: string; quantity: number }[] | null;
}

/**
 * Hands a parcel to the carrier: some or all of the units still to ship, with
 * its carrier and tracking. Records the shipment, the audit entry and the
 * shopper's shipping email. The order moves to shipped once nothing is left;
 * a parcel holding only part of it leaves the status as it was.
 */
export async function fulfilOrder(
  ctx: OperationContext,
  order: Order,
  input: ShipmentInput,
): Promise<{ shipment: OrderShipment; complete: boolean }> {
  const { store, actor } = ctx;
  const { carrier } = input;
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.orders" });
  if (!CARRIERS.includes(carrier)) throw new OperationError("invalid", t("chooseCarrier"), "carrier");
  const enabled = store.carriers.find((c) => c.carrier === carrier && c.enabled);
  if (!enabled) {
    throw new OperationError("invalid", t("carrierDisabled", { carrier: CARRIER_LABELS[carrier] }), "carrier");
  }
  const trackingNumber = input.trackingNumber.trim() || trackingNumberFor(carrier, order.code);
  if (trackingNumber.length < 6) {
    throw new OperationError("invalid", t("trackingTooShort"), "trackingNumber");
  }
  if (!canShip(order)) throw new OperationError("conflict", t("notShippable"));

  // Gift cards go out by email, so there is nothing of them to put in a parcel.
  const giftLines = await giftCardLineIds(order);
  const plan = planShipment(order, input.lines, giftLines);
  if (!plan.ok) {
    const item = order.items.find((i) => i.id === plan.itemId);
    throw new OperationError(
      plan.problem === "nothingLeft" ? "conflict" : "invalid",
      t(`shipment.${plan.problem}`, { item: item?.productName ?? "" }),
      plan.itemId ? `quantity_${plan.itemId}` : "lines",
    );
  }

  const storeId = store.id;
  const trackingUrl = TRACKING_URLS[carrier](trackingNumber);
  const shipment: OrderShipment = {
    id: newId("shp"),
    carrier,
    trackingNumber,
    trackingUrl,
    lines: plan.lines,
    at: new Date().toISOString(),
    actor: actor.name,
  };
  const units = plan.lines.reduce((sum, line) => sum + line.quantity, 0);
  const written = await updateOrder(
    order.id,
    {
      status: plan.complete ? "shipped" : order.status,
      shipments: [...(order.shipments ?? []), shipment],
      fulfillment: { ...order.fulfillment, carrier, trackingNumber, trackingUrl },
      events: [
        ...order.events,
        orderEvent(
          plan.complete ? "Shipped" : "Partially shipped",
          plan.complete && !order.shipments?.length
            ? `Handed to ${CARRIER_LABELS[carrier]}, tracking ${trackingNumber}.`
            : `${units} ${units === 1 ? "unit" : "units"} handed to ${CARRIER_LABELS[carrier]}, tracking ${trackingNumber}.`,
          actor.name,
        ),
      ],
    },
    // Two parcels recorded at once must not both take the same units.
    { updatedAt: order.updatedAt },
  );
  if (!written) throw new OperationError("conflict", t("orderChanged"));

  recordAudit({
    category: "order_routing",
    action: plan.complete ? "order.shipped" : "order.partially_shipped",
    summary: `${order.code} ${plan.complete ? "shipped" : `partly shipped (${units} ${units === 1 ? "unit" : "units"})`} with ${CARRIER_LABELS[carrier]} (${trackingNumber})`,
    storeId,
    agencyId: store.agencyId,
    actorId: actor.id,
    actorName: actor.name,
    entity: "order",
    entityId: order.code,
    meta: { carrier, trackingNumber, units, complete: plan.complete },
  });
  if (plan.complete) emitOrderWebhook(storeId, order.id, "order.fulfilled");

  // The shopper is told their parcel is moving; a mail provider that is down
  // leaves the shipment recorded and the attempt in the store's activity.
  try {
    const origin = await siteOrigin();
    // Written in the language the shopper checked out in, if the store still offers it.
    const locale = shopperLocale(store, order.locale ?? "");
    const base = storeLinkBase(store, locale, origin);
    const partial = !plan.complete || (order.shipments?.length ?? 0) > 0;
    sendEmail({
      to: order.customer.email,
      message: shippingNotificationEmail(brandFor(store), await emailCopy(locale), {
        customerName: order.customer.name,
        code: order.code,
        carrierName: CARRIER_LABELS[carrier],
        trackingNumber,
        trackingUrl,
        statusUrl: orderStatusUrl(base, order.code, await signOrderToken(storeId, order.code)),
        partialItems: partial
          ? plan.lines.map((line) => ({
              name: order.items.find((item) => item.id === line.itemId)?.productName ?? "",
              quantity: line.quantity,
            }))
          : null,
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
  return { shipment, complete: plan.complete };
}

/**
 * Ships everything still to ship in one parcel. On an order already shipped in
 * full, the tracking of its last parcel is corrected instead, without emailing
 * the shopper again.
 */
export async function shipOrder(
  ctx: OperationContext,
  order: Order,
  carrier: Carrier,
  entered: string,
): Promise<{ trackingNumber: string; trackingUrl: string }> {
  const giftLines = await giftCardLineIds(order);
  if (remainingQuantities(order, giftLines).size > 0 || order.status !== "shipped") {
    const { shipment } = await fulfilOrder(ctx, order, { carrier, trackingNumber: entered, lines: null });
    return { trackingNumber: shipment.trackingNumber, trackingUrl: shipment.trackingUrl };
  }
  return retrackOrder(ctx, order, carrier, entered);
}

async function retrackOrder(
  ctx: OperationContext,
  order: Order,
  carrier: Carrier,
  entered: string,
): Promise<{ trackingNumber: string; trackingUrl: string }> {
  const { store, actor } = ctx;
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.orders" });
  if (!CARRIERS.includes(carrier)) throw new OperationError("invalid", t("chooseCarrier"), "carrier");
  if (!store.carriers.some((c) => c.carrier === carrier && c.enabled)) {
    throw new OperationError("invalid", t("carrierDisabled", { carrier: CARRIER_LABELS[carrier] }), "carrier");
  }
  const trackingNumber = entered.trim() || trackingNumberFor(carrier, order.code);
  if (trackingNumber.length < 6) throw new OperationError("invalid", t("trackingTooShort"), "trackingNumber");
  const trackingUrl = TRACKING_URLS[carrier](trackingNumber);
  const shipments = order.shipments?.length
    ? order.shipments.map((shipment, index, all) =>
        index === all.length - 1 ? { ...shipment, carrier, trackingNumber, trackingUrl } : shipment,
      )
    : order.shipments;
  await updateOrder(order.id, {
    fulfillment: { ...order.fulfillment, carrier, trackingNumber, trackingUrl },
    ...(shipments ? { shipments } : {}),
    events: [
      ...order.events,
      orderEvent("Tracking updated", `${CARRIER_LABELS[carrier]}, tracking ${trackingNumber}.`, actor.name),
    ],
  });
  recordAudit({
    category: "order_routing",
    action: "order.tracking_updated",
    summary: `Updated tracking on ${order.code} to ${CARRIER_LABELS[carrier]} (${trackingNumber})`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: actor.id,
    actorName: actor.name,
    entity: "order",
    entityId: order.code,
    meta: { carrier, trackingNumber },
  });
  revalidateOrder(store.id, order.id);
  return { trackingNumber, trackingUrl };
}

/* ---------------------------------------------------------- notes and tags */

/** Saves the team's note and tags on the order. Neither is shown to the shopper. */
export async function saveOrderNotes(
  ctx: OperationContext,
  order: Order,
  input: { note?: string; tags?: unknown },
): Promise<Order> {
  const { store, actor } = ctx;
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.orders" });
  const note = input.note === undefined ? (order.note ?? "") : input.note.trim();
  if (note.length > MAX_NOTE_LENGTH) throw new OperationError("invalid", t("noteTooLong", { max: MAX_NOTE_LENGTH }), "note");
  const tags = input.tags === undefined ? (order.tags ?? []) : normaliseTags(input.tags);
  if (tags.length > MAX_TAGS) throw new OperationError("invalid", t("tooManyTags", { max: MAX_TAGS }), "tags");

  const noteChanged = note !== (order.note ?? "");
  const tagsChanged = tags.join("\n") !== (order.tags ?? []).join("\n");
  if (!noteChanged && !tagsChanged) return order;
  await updateOrder(order.id, { note, tags });
  recordAudit({
    category: "order_routing",
    action: "order.notes_updated",
    summary: `Updated the ${[noteChanged ? "note" : null, tagsChanged ? "tags" : null].filter(Boolean).join(" and ")} on ${order.code}`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: actor.id,
    actorName: actor.name,
    entity: "order",
    entityId: order.code,
    meta: { tags: tags.join(", ") },
  });
  revalidateOrder(store.id, order.id);
  return { ...order, note, tags };
}

/* -------------------------------------------------------- shipping address */

/**
 * Corrects where the order goes. Only before anything has shipped: the
 * supplier and the carrier work from the address on the order.
 */
export async function updateShippingAddress(
  ctx: OperationContext,
  order: Order,
  input: Partial<Record<keyof AddressInput, unknown>>,
): Promise<Order> {
  const { store, actor } = ctx;
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.orders" });
  if (!canEditAddress(order)) throw new OperationError("conflict", t("addressLocked"));
  const read = readAddress(input);
  if (!read.ok) throw new OperationError("invalid", t(`address.${read.field}`), read.field);

  const { email, anonymisedAt } = order.customer;
  const customer: Order["customer"] = { ...read.address, email, ...(anonymisedAt ? { anonymisedAt } : {}) };
  const before = order.customer;
  const changed = (["name", "line1", "line2", "city", "region", "postalCode", "country", "phone"] as const).filter(
    (key) => (before[key] ?? "") !== (customer[key] ?? ""),
  );
  if (changed.length === 0) return order;

  const written = await updateOrder(
    order.id,
    {
      customer,
      events: [...order.events, orderEvent("Shipping address updated", `Changed ${changed.join(", ")}.`, actor.name)],
    },
    { updatedAt: order.updatedAt },
  );
  if (!written) throw new OperationError("conflict", t("orderChanged"));
  recordAudit({
    category: "order_routing",
    action: "order.address_updated",
    summary: `Updated the shipping address on ${order.code}`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: actor.id,
    actorName: actor.name,
    entity: "order",
    entityId: order.code,
    meta: { fields: changed.join(",") },
  });
  refreshCustomers(store, [email]);
  revalidateOrder(store.id, order.id);
  return { ...order, customer };
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
  // An unpaid order cancelled by hand gives back the stock its checkout held.
  if (status === "cancelled") await releaseOrderStock(order);
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
  if (status === "cancelled") {
    refreshCustomers(store, [order.customer.email]);
    emitOrderWebhook(store.id, order.id, "order.cancelled");
  }
  revalidateOrder(store.id, order.id);
  return true;
}

/* ----------------------------------------------------- abandoned checkouts */

/**
 * Turns the abandoned checkout email on or off and sets how long after the
 * checkout expired it goes. Turning it on starts from now: checkouts
 * abandoned before are never emailed.
 */
export async function saveCheckoutRecovery(
  ctx: OperationContext,
  input: { enabled: boolean; delayHours: unknown },
): Promise<CheckoutRecoverySettings> {
  const { store, actor } = ctx;
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.orders" });
  const delayHours = readDelayHours(input.delayHours);
  if (delayHours === null) {
    throw new OperationError("invalid", t("recoveryDelay", { min: RECOVERY_DELAY_MIN, max: RECOVERY_DELAY_MAX }), "delayHours");
  }
  const current = recoverySettings(store);
  const settings: CheckoutRecoverySettings = {
    enabled: input.enabled,
    delayHours,
    enabledAt: input.enabled ? (current.enabled && current.enabledAt ? current.enabledAt : new Date().toISOString()) : null,
  };
  await updateStore(store.id, { checkoutRecovery: settings });
  recordAudit({
    category: "store_setup",
    action: "store.checkout_recovery",
    summary: input.enabled
      ? `Turned on abandoned checkout emails, sent ${delayHours} ${delayHours === 1 ? "hour" : "hours"} after checkout`
      : "Turned off abandoned checkout emails",
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: actor.id,
    actorName: actor.name,
    entity: "store",
    entityId: store.id,
    meta: { enabled: input.enabled, delayHours },
  });
  revalidatePath(`/app/stores/${store.id}/orders/abandoned`);
  return settings;
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
  /** Put the order's units back on hand. */
  restock?: boolean;
}

/**
 * Gives money back on an order, optionally cancelling it. Nothing is recorded
 * unless the payment provider returned the money.
 */
export async function refundOrder(
  ctx: OperationContext,
  order: Order,
  input: RefundInput,
): Promise<{ order: Order; amount: number; refundId: string | null; restocked: boolean }> {
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
  const restocked = input.restock ? await restockOrder(order, store, actor) : false;
  if (restocked) {
    revalidatePath(`/app/stores/${store.id}/catalog/inventory`);
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
    meta: { amount, reason, gatewayRefundId: gateway.refundId, restocked },
    notify: {
      type: "refund_recorded",
      href: `/app/stores/${store.id}/orders/${order.id}`,
      params: { code: order.code, amount, currency: order.currency },
    },
  });
  refreshCustomers(store, [order.customer.email]);
  emitOrderWebhook(store.id, order.id, "order.refunded", ...(input.cancel && order.status !== "cancelled" ? (["order.cancelled"] as const) : []));
  revalidateOrder(store.id, order.id);
  return { order: { ...order, ...patch }, amount, refundId: gateway.refundId, restocked };
}

/* ----------------------------------------------------------------- routing */

/** Runs automatic routing for one order and records whatever it decided. */
export async function routeToSupplier(ctx: OperationContext, order: Order): Promise<RoutingDecision> {
  const { store, actor } = ctx;
  const decision = await routeOrder(order, store);
  const events = [...order.events, orderEvent(
    decision.routing === "submitted" ? "Sent to supplier" : "Manual handling required",
    decision.message,
    actor.name,
  )];

  await updateOrder(order.id, {
    status: decision.routing === "submitted" ? "in_production" : order.status === "paid" ? "paid" : order.status,
    fulfillment: {
      ...order.fulfillment,
      supplierId: decision.supplierId,
      supplierName: decision.supplierName,
      routing: decision.routing,
      supplierOrderRef: decision.supplierOrderRef,
      submittedAt: decision.routing === "submitted" ? new Date().toISOString() : order.fulfillment.submittedAt,
      submissionMessage: decision.message,
      exception: decision.exception,
    },
    events,
  });
  recordAudit({
    category: "order_routing",
    action: decision.routing === "submitted" ? "order.routed" : "order.manual_required",
    summary:
      decision.routing === "submitted"
        ? `Routed ${order.code} to ${decision.supplierName}`
        : `${order.code} flagged for manual supplier handling`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: actor.id,
    actorName: actor.name,
    entity: "order",
    entityId: order.code,
    meta: { routing: decision.routing },
  });
  revalidateOrder(store.id, order.id);
  return decision;
}

/**
 * Sends the job to a supplier the order manager picked, for the orders
 * automatic routing cannot place — most often a destination the sourced
 * supplier does not produce in. The choice is re-checked against the live
 * supplier records before anything is written. `already` is true when the
 * identical reroute had been done, so nothing was repeated.
 */
export async function rerouteToSupplier(
  ctx: OperationContext,
  order: Order,
  input: { supplierId: string; reason: string },
): Promise<{ already: boolean; supplierName: string; reference: string }> {
  const { store, actor } = ctx;
  const supplierId = input.supplierId.trim();
  const reason = input.reason.trim();
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.orders" });

  if (!supplierId) throw new OperationError("invalid", t("chooseSupplier"), "supplierId");
  if (reason.length < 4) throw new OperationError("invalid", t("reasonRequired"), "reason");

  const already = order.fulfillment.reroute;
  // A double click, a slow response or a retried tab must not raise the same
  // job twice: the identical reroute is reported as done rather than repeated.
  if (
    order.fulfillment.routing === "submitted" &&
    order.fulfillment.supplierId === supplierId &&
    already?.reason === reason
  ) {
    return {
      already: true,
      supplierName: order.fulfillment.supplierName ?? "",
      reference: order.fulfillment.supplierOrderRef ?? "",
    };
  }

  const supplier = await getSupplier(supplierId);
  if (!supplier) throw new OperationError("invalid", t("supplierGone"), "supplierId");

  const decision = await submitToSupplier(order, store, supplier);
  if (decision.routing !== "submitted") throw new OperationError("invalid", decision.message, "supplierId");

  const from = order.fulfillment.supplierName;
  const at = new Date().toISOString();
  const summary = from
    ? `Rerouted from ${from} to ${supplier.name}: ${reason}.`
    : `Routed to ${supplier.name}: ${reason}.`;

  await updateOrder(order.id, {
    status: "in_production",
    fulfillment: {
      ...order.fulfillment,
      supplierId: supplier.id,
      supplierName: supplier.name,
      routing: "submitted",
      supplierOrderRef: decision.supplierOrderRef,
      submittedAt: at,
      submissionMessage: `${summary} ${decision.message}`,
      exception: null,
      reroute: {
        fromSupplierId: order.fulfillment.supplierId,
        fromSupplierName: from,
        reason,
        actor: actor.name,
        at,
      },
    },
    events: [
      ...order.events,
      orderEvent("Rerouted to supplier", `${summary} Accepted as ${decision.supplierOrderRef}.`, actor.name),
    ],
  });
  recordAudit({
    category: "order_routing",
    action: "order.rerouted",
    summary: `${order.code}: ${summary.replace(/\.$/, "")}`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: actor.id,
    actorName: actor.name,
    entity: "order",
    entityId: order.code,
    meta: {
      from: order.fulfillment.supplierId,
      to: supplier.id,
      reason,
      reference: decision.supplierOrderRef,
    },
  });
  revalidateOrder(store.id, order.id);
  return { already: false, supplierName: supplier.name, reference: decision.supplierOrderRef ?? "" };
}

/** Records a purchase order raised with the supplier by hand, outside any supplier API. */
export async function recordManualSubmission(ctx: OperationContext, order: Order, entered: string): Promise<string> {
  const { store, actor } = ctx;
  const reference = entered.trim();
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.orders" });
  if (reference.length < 3) throw new OperationError("invalid", t("referenceRequired"), "reference");

  await updateOrder(order.id, {
    status: "in_production",
    fulfillment: {
      ...order.fulfillment,
      routing: "submitted",
      supplierOrderRef: reference,
      submittedAt: new Date().toISOString(),
      submissionMessage: `Purchase order ${reference} raised manually with ${order.fulfillment.supplierName ?? "the supplier"}.`,
      exception: null,
    },
    events: [...order.events, orderEvent("Sent to supplier", `Manual purchase order ${reference} recorded.`, actor.name)],
  });
  recordAudit({
    category: "order_routing",
    action: "order.manual_submitted",
    summary: `Recorded manual supplier submission ${reference} for ${order.code}`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: actor.id,
    actorName: actor.name,
    entity: "order",
    entityId: order.code,
    meta: { reference },
  });
  revalidateOrder(store.id, order.id);
  return reference;
}

/* -------------------------------------------------------------- exceptions */

/** Flags the order for manual attention with a note, and notifies the store team. */
export async function raiseException(ctx: OperationContext, order: Order, entered: string): Promise<void> {
  const { store, actor } = ctx;
  const note = entered.trim();
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.orders" });
  if (note.length < 5) throw new OperationError("invalid", t("describeProblem"), "note");

  await updateOrder(order.id, {
    status: "exception",
    fulfillment: { ...order.fulfillment, exception: note },
    events: [...order.events, orderEvent("Exception raised", note, actor.name)],
  });
  recordAudit({
    category: "order_routing",
    action: "order.exception",
    summary: `Raised an exception on ${order.code}: ${note}`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: actor.id,
    actorName: actor.name,
    entity: "order",
    entityId: order.code,
    meta: {},
    notify: { type: "order_exception", href: `/app/stores/${store.id}/orders/${order.id}`, params: { code: order.code } },
  });
  revalidateOrder(store.id, order.id);
}

/** Clears the order's exception; false when it had none. */
export async function resolveException(ctx: OperationContext, order: Order): Promise<boolean> {
  const { store, actor } = ctx;
  if (!order.fulfillment.exception && order.status !== "exception") return false;

  await updateOrder(order.id, {
    status: order.fulfillment.routing === "submitted" ? "in_production" : "paid",
    fulfillment: { ...order.fulfillment, exception: null },
    events: [...order.events, orderEvent("Exception resolved", "Marked resolved by the store team.", actor.name)],
  });
  recordAudit({
    category: "order_routing",
    action: "order.exception_resolved",
    summary: `Resolved the exception on ${order.code}`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: actor.id,
    actorName: actor.name,
    entity: "order",
    entityId: order.code,
    meta: {},
  });
  revalidateOrder(store.id, order.id);
  return true;
}

/* -------------------------------------------------------------------- bulk */

/** What a bulk action did to each selected order. */
export interface BulkResult {
  succeeded: { id: string; code: string }[];
  failed: { id: string; code: string; reason: string }[];
}

/**
 * Runs `work` over the selected orders of the store, a few at a time, and
 * reports each one. Every order goes through the same helper its own page
 * uses, so each gets its own events, audit entry and shopper email. `work`
 * returns null when the order was handled, or the reason it was not.
 */
async function forEachOrder(
  ctx: OperationContext,
  orderIds: unknown,
  work: (order: Order, blocked: (reason: BulkBlock) => string) => Promise<string | null>,
): Promise<BulkResult> {
  const [t, labels] = await Promise.all([
    getTranslations({ locale: ctx.locale, namespace: "orders.bulk" }),
    getTranslations({ locale: ctx.locale, namespace: "labels" }),
  ]);
  const ids = parseOrderIds(orderIds);
  if (ids.length === 0) throw new OperationError("invalid", t("noneSelected"), "orderIds");

  const orders = await getStoreOrders(ctx.store.id, ids);
  const outcome: BulkResult = { succeeded: [], failed: [] };
  const found = new Set(orders.map((order) => order.id));
  for (const id of ids) {
    if (!found.has(id)) outcome.failed.push({ id, code: id, reason: t("notFound") });
  }

  // Five at a time keeps the database pool and the supplier APIs unhurried.
  for (let i = 0; i < orders.length; i += 5) {
    await Promise.all(
      orders.slice(i, i + 5).map(async (order) => {
        const blocked = (reason: BulkBlock) =>
          t(`blocked.${reason}`, { status: labels(`orderStatus.${order.status}`) });
        let reason: string | null;
        try {
          reason = await work(order, blocked);
        } catch (error) {
          console.error(`Bulk action failed on ${order.code}`, error);
          reason = t("failedGeneric");
        }
        if (reason) outcome.failed.push({ id: order.id, code: order.code, reason });
        else outcome.succeeded.push({ id: order.id, code: order.code });
      }),
    );
  }
  return outcome;
}

/** Marks the selected orders shipped, each with its own carrier and tracking number. */
export async function bulkShipOrders(
  ctx: OperationContext,
  shipments: { orderId: string; carrier: string; trackingNumber: string }[],
): Promise<BulkResult> {
  const list = Array.isArray(shipments) ? shipments : [];
  const byId = new Map(list.map((entry) => [String(entry?.orderId ?? ""), entry]));
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.orders" });

  return forEachOrder(ctx, [...byId.keys()], async (order, blocked) => {
    const entry = byId.get(order.id)!;
    const carrier = String(entry.carrier ?? "") as Carrier;
    const trackingNumber = String(entry.trackingNumber ?? "").trim();
    const block = shipBlock(order);
    if (block) return blocked(block);
    if (!CARRIERS.includes(carrier)) return t("chooseCarrier");
    // A retried request finds the same tracking already recorded and leaves
    // it, so the shopper is not emailed twice.
    if (
      order.status === "shipped" &&
      order.fulfillment.carrier === carrier &&
      (!trackingNumber || order.fulfillment.trackingNumber === trackingNumber)
    ) {
      return null;
    }
    try {
      await shipOrder(ctx, order, carrier, trackingNumber);
      return null;
    } catch (error) {
      if (isOperationError(error)) return error.message;
      throw error;
    }
  });
}

/** Moves the selected orders on to one status, where the status rules allow it. */
export async function bulkAdvanceOrders(ctx: OperationContext, orderIds: string[], status: BulkStatus): Promise<BulkResult> {
  if (!BULK_STATUSES.includes(status)) {
    const t = await getTranslations({ locale: ctx.locale, namespace: "orders.bulk" });
    throw new OperationError("invalid", t("failedGeneric"), "status");
  }
  return forEachOrder(ctx, orderIds, async (order, blocked) => {
    const block = moveBlock(order, status);
    if (block) return blocked(block);
    return (await moveOrder(ctx, order, status)) ? null : blocked("cannotMove");
  });
}

/** Sends the selected paid orders to their suppliers through automatic routing. */
export async function bulkRouteOrders(ctx: OperationContext, orderIds: string[]): Promise<BulkResult> {
  return forEachOrder(ctx, orderIds, async (order, blocked) => {
    const block = routeBlock(order);
    if (block) return blocked(block);
    const decision = await routeToSupplier(ctx, order);
    return decision.routing === "submitted" ? null : decision.message;
  });
}

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
import { presentOrder } from "../api/present";
import { addressRegionKind } from "../countries";
import { trackingNumberFor } from "../fulfillment";
import { releaseOrderStock, restockOrder } from "../inventory";
import { orderStatusUrl, signOrderToken } from "../order-access";
import {
  MAX_NOTE_LENGTH,
  MAX_TAGS,
  MAX_TAG_LENGTH,
  canEditAddress,
  normalizeTags,
  orderFulfillments,
  parcelLines,
  unshippedLines,
} from "../order-ops";
import { refundOnConnectedAccount } from "../stripe";
import {
  canMoveOrder,
  type FulfillmentEvent,
  type Order,
  type OrderFulfillment,
  type OrderStatus,
  type Store,
} from "../types";
import { CARRIER_LABELS, TRACKING_URLS, formatMoney, newId } from "../util";
import { emitWebhook } from "../webhooks";
import { OperationError, type OperationContext } from "./context";

/**
 * Working an order: handing it to the carrier a parcel at a time, its notes,
 * tags and address, moving it through its statuses, and refunding it. The workspace's order actions, its bulk actions and the
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

export interface ParcelLine {
  itemId: string;
  quantity: number;
}

/**
 * Hands a parcel to the carrier: the lines and quantities in it (everything
 * still to ship when none are named), its tracking, the audit entry and the
 * shopper's shipping email. With no tracking number given, the carrier's own
 * is used. The order is shipped once every unit has gone; until then it stays
 * where it was. When nothing is left to ship, the latest parcel's tracking is
 * corrected instead.
 */
export async function shipOrder(
  ctx: OperationContext,
  order: Order,
  carrier: Carrier,
  entered: string,
  requested?: ParcelLine[] | null,
): Promise<{ trackingNumber: string; trackingUrl: string; fulfillment: OrderFulfillment; order: Order }> {
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
  const parcels = orderFulfillments(order);
  const asked = parcelLines(order, requested);
  let fulfillments: OrderFulfillment[];
  let parcel: OrderFulfillment;
  if ("problem" in asked) {
    // Everything has gone: a retracking corrects the latest parcel, unless lines were named.
    if (asked.problem !== "nothingLeft" || (requested && requested.length > 0) || parcels.length === 0) {
      throw new OperationError("invalid", t(`parcel.${asked.problem}`), "lines");
    }
    const latest = parcels[parcels.length - 1];
    parcel = { ...latest, id: latest.id === "legacy" ? newId("ful") : latest.id, carrier, trackingNumber, trackingUrl };
    fulfillments = [...parcels.slice(0, -1), parcel];
  } else {
    parcel = { id: newId("ful"), lines: asked.lines, carrier, trackingNumber, trackingUrl, at: new Date().toISOString(), actor: actor.name };
    fulfillments = [...parcels, parcel];
  }
  const complete = unshippedLines({ ...order, fulfillments }).length === 0;
  const units = parcel.lines.reduce((sum, line) => sum + line.quantity, 0);
  const patch: Partial<Order> = {
    status: complete ? "shipped" : order.status,
    fulfillments,
    fulfillment: { ...order.fulfillment, carrier, trackingNumber, trackingUrl },
    events: [
      ...order.events,
      orderEvent(
        complete ? "Shipped" : "Partially shipped",
        `${units} ${units === 1 ? "unit" : "units"} handed to ${CARRIER_LABELS[carrier]}, tracking ${trackingNumber}.`,
        actor.name,
      ),
    ],
  };
  await updateOrder(order.id, patch);
  const updated: Order = { ...order, ...patch };
  recordAudit({
    category: "order_routing",
    action: "order.shipped",
    summary: `${order.code} ${complete ? "shipped" : "partly shipped"} with ${CARRIER_LABELS[carrier]} (${trackingNumber})`,
    storeId,
    agencyId: store.agencyId,
    actorId: actor.id,
    actorName: actor.name,
    entity: "order",
    entityId: order.code,
    meta: { carrier, trackingNumber, units, complete },
  });
  emitWebhook(storeId, "order.fulfilled", { ...presentOrder(updated), fulfillment: parcel });

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
        partial: !complete,
        items: parcel.lines.map((line) => {
          const item = order.items.find((i) => i.id === line.itemId);
          return { name: item ? `${item.productName} · ${item.variantName}` : line.itemId, quantity: line.quantity };
        }),
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
  return { trackingNumber, trackingUrl, fulfillment: parcel, order: updated };
}

/* ------------------------------------------------------ notes and address */

/** The team's note and tags on an order. Fields left out keep their value. */
export async function saveOrderNotes(
  ctx: OperationContext,
  order: Order,
  input: { note?: string; tags?: string | string[] },
): Promise<Order> {
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.orders" });
  const patch: Partial<Order> = {};
  if (input.note !== undefined) {
    const note = String(input.note).trim();
    if (note.length > MAX_NOTE_LENGTH) throw new OperationError("invalid", t("noteTooLong", { max: MAX_NOTE_LENGTH }), "note");
    if (note !== (order.note ?? "")) patch.note = note;
  }
  if (input.tags !== undefined) {
    const tags = normalizeTags(input.tags);
    if (!tags) throw new OperationError("invalid", t("tagsInvalid", { max: MAX_TAGS, length: MAX_TAG_LENGTH }), "tags");
    if (tags.join("\n") !== (order.tags ?? []).join("\n")) patch.tags = tags;
  }
  if (Object.keys(patch).length === 0) return order;
  await updateOrder(order.id, patch);
  recordAudit({
    category: "order_routing",
    action: "order.notes_updated",
    summary: `Updated the ${[patch.note !== undefined ? "note" : null, patch.tags ? "tags" : null].filter(Boolean).join(" and ")} on ${order.code}`,
    storeId: ctx.store.id,
    agencyId: ctx.store.agencyId,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "order",
    entityId: order.code,
    meta: patch.tags ? { tags: patch.tags.join(",") } : {},
  });
  revalidateOrder(ctx.store.id, order.id);
  return { ...order, ...patch };
}

export interface AddressInput {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  region?: string;
  postalCode: string;
  country: string;
  phone?: string;
}

/** Corrects where the order ships to, until its first parcel has gone. */
export async function updateShippingAddress(ctx: OperationContext, order: Order, input: AddressInput): Promise<Order> {
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.orders" });
  if (!canEditAddress(order)) throw new OperationError("conflict", t("addressLocked"));
  const value = (key: keyof AddressInput) => String(input[key] ?? "").trim();
  const country = value("country").toUpperCase();
  const region = addressRegionKind(country) ? value("region") : "";
  if (value("name").length < 2) throw new OperationError("invalid", t("address.name"), "name");
  if (value("line1").length < 4) throw new OperationError("invalid", t("address.line1"), "line1");
  if (value("city").length < 2) throw new OperationError("invalid", t("address.city"), "city");
  if (value("postalCode").length < 3) throw new OperationError("invalid", t("address.postalCode"), "postalCode");
  if (!/^[A-Z]{2}$/.test(country)) throw new OperationError("invalid", t("address.country"), "country");
  if (addressRegionKind(country) && region.length < 2) throw new OperationError("invalid", t("address.region"), "region");
  if (value("phone") && !/^\+?[\d\s().-]{6,20}$/.test(value("phone"))) {
    throw new OperationError("invalid", t("address.phone"), "phone");
  }
  const customer: Order["customer"] = {
    ...order.customer,
    name: value("name"),
    line1: value("line1"),
    city: value("city"),
    postalCode: value("postalCode"),
    country,
  };
  for (const key of ["line2", "region", "phone"] as const) {
    const entered = key === "region" ? region : value(key);
    if (entered) customer[key] = entered;
    else delete customer[key];
  }
  const written = await updateOrder(
    order.id,
    {
      customer,
      events: [...order.events, orderEvent("Address updated", "Shipping address changed by the store team.", ctx.actor.name)],
    },
    { updatedAt: order.updatedAt },
  );
  if (!written) throw new OperationError("conflict", t("orderChanged"));
  recordAudit({
    category: "order_routing",
    action: "order.address_updated",
    summary: `Changed the shipping address on ${order.code}`,
    storeId: ctx.store.id,
    agencyId: ctx.store.agencyId,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "order",
    entityId: order.code,
    meta: { country },
  });
  revalidateOrder(ctx.store.id, order.id);
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
    emitWebhook(store.id, "order.cancelled", presentOrder({ ...order, ...patch }));
  }
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
  const refundedOrder: Order = { ...order, ...patch };
  emitWebhook(store.id, "order.refunded", { ...presentOrder(refundedOrder), refund: refunds[refunds.length - 1] });
  if (input.cancel && order.status !== "cancelled") emitWebhook(store.id, "order.cancelled", presentOrder(refundedOrder));
  revalidateOrder(store.id, order.id);
  return { order: refundedOrder, amount, refundId: gateway.refundId, restocked };
}

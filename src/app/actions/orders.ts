"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { refreshCustomers } from "@/lib/customer-data";
import {
  BULK_STATUSES,
  moveBlock,
  parseOrderIds,
  routeBlock,
  shipBlock,
  type BulkBlock,
  type BulkStatus,
} from "@/lib/bulk-orders";
import { getOrder, getStoreOrders, getSupplier, recordAudit, updateOrder } from "@/lib/data";
import { sendEmail, siteOrigin } from "@/lib/email";
import { brandFor, shippingNotificationEmail } from "@/lib/email-templates";
import { emailCopy, shopperLocale } from "@/i18n/storefront";
import { localeBase, storeLanguages } from "@/i18n/storefront-routing";
import { orderStatusUrl, signOrderToken } from "@/lib/order-access";
import { routeOrder, submitToSupplier, trackingNumberFor } from "@/lib/fulfillment";
import { assertStoreAccess } from "@/lib/session";
import { refundCharge } from "@/lib/stripe";
import { canMoveOrder, type FulfillmentEvent, type Order, type OrderStatus } from "@/lib/types";
import { CARRIER_LABELS, TRACKING_URLS, formatMoney, newId, parseMoney } from "@/lib/util";
import type { ActionState } from "./stores";

async function load(storeId: string, orderId: string) {
  // The permission check and the order read are independent, so they go out
  // together rather than costing two round trips in a row.
  const [access, order] = await Promise.all([
    assertStoreAccess(storeId, "store.orders"),
    getOrder(orderId),
  ]);
  if (!order || order.storeId !== storeId) throw new Error("Order not found in this store.");
  return { ...access, order };
}

function event(status: string, note: string, actor: string): FulfillmentEvent {
  return { at: new Date().toISOString(), status, note, actor };
}

function refresh(storeId: string, orderId: string) {
  revalidatePath(`/app/stores/${storeId}/orders`);
  revalidatePath(`/app/stores/${storeId}/orders/${orderId}`);
}

type Access = Awaited<ReturnType<typeof assertStoreAccess>>;

/** Runs automatic routing for one order and records whatever it decided. */
async function routeOne({ user, store }: Access, order: Order) {
  const decision = await routeOrder(order, store);
  const events = [...order.events, event(
    decision.routing === "submitted" ? "Sent to supplier" : "Manual handling required",
    decision.message,
    user.name,
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
    actorId: user.id,
    actorName: user.name,
    entity: "order",
    entityId: order.code,
    meta: { routing: decision.routing },
  });
  refresh(store.id, order.id);
  return decision;
}

/** Re-runs supplier routing, e.g. after a carrier or supplier problem is fixed. */
export async function routeToSupplier(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const { order, ...access } = await load(storeId, orderId);
  await routeOne(access, order);
}

/**
 * Sends the job to a supplier the order manager picked, for the orders
 * automatic routing cannot place — most often a destination the sourced
 * supplier does not produce in. The choice is re-checked against the live
 * supplier records before anything is written.
 */
export async function rerouteToSupplier(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const supplierId = String(formData.get("supplierId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const t = await getTranslations("actions.orders");

  if (!supplierId) {
    return { status: "error", message: t("chooseSupplier"), field: "supplierId" };
  }
  if (reason.length < 4) {
    return { status: "error", message: t("reasonRequired"), field: "reason" };
  }

  const { user, store, order } = await load(storeId, orderId);
  const already = order.fulfillment.reroute;
  // A double click, a slow response or a retried tab must not raise the same
  // job twice: the identical reroute is reported as done rather than repeated.
  if (
    order.fulfillment.routing === "submitted" &&
    order.fulfillment.supplierId === supplierId &&
    already?.reason === reason
  ) {
    return {
      status: "success",
      message: t("alreadyWith", {
        code: order.code,
        supplier: order.fulfillment.supplierName ?? "",
        reference: order.fulfillment.supplierOrderRef ?? "",
      }),
    };
  }

  const supplier = await getSupplier(supplierId);
  if (!supplier) {
    return { status: "error", message: t("supplierGone"), field: "supplierId" };
  }

  const decision = await submitToSupplier(order, store, supplier);
  if (decision.routing !== "submitted") {
    return { status: "error", message: decision.message, field: "supplierId" };
  }

  const from = order.fulfillment.supplierName;
  const at = new Date().toISOString();
  const summary = from
    ? `Rerouted from ${from} to ${supplier.name}: ${reason}.`
    : `Routed to ${supplier.name}: ${reason}.`;

  await updateOrder(orderId, {
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
        actor: user.name,
        at,
      },
    },
    events: [
      ...order.events,
      event(
        "Rerouted to supplier",
        `${summary} Accepted as ${decision.supplierOrderRef}.`,
        user.name,
      ),
    ],
  });
  recordAudit({
    category: "order_routing",
    action: "order.rerouted",
    summary: `${order.code}: ${summary.replace(/\.$/, "")}`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "order",
    entityId: order.code,
    meta: {
      from: order.fulfillment.supplierId,
      to: supplier.id,
      reason,
      reference: decision.supplierOrderRef,
    },
  });
  refresh(storeId, orderId);
  return {
    status: "success",
    message: t("accepted", { supplier: supplier.name, code: order.code, reference: decision.supplierOrderRef ?? "" }),
  };
}

export async function recordManualSubmission(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const reference = String(formData.get("reference") ?? "").trim();
  const t = await getTranslations("actions.orders");
  if (reference.length < 3) {
    return { status: "error", message: t("referenceRequired"), field: "reference" };
  }

  const { user, store, order } = await load(storeId, orderId);
  await updateOrder(orderId, {
    status: "in_production",
    fulfillment: {
      ...order.fulfillment,
      routing: "submitted",
      supplierOrderRef: reference,
      submittedAt: new Date().toISOString(),
      submissionMessage: `Purchase order ${reference} raised manually with ${order.fulfillment.supplierName ?? "the supplier"}.`,
      exception: null,
    },
    events: [...order.events, event("Sent to supplier", `Manual purchase order ${reference} recorded.`, user.name)],
  });
  recordAudit({
    category: "order_routing",
    action: "order.manual_submitted",
    summary: `Recorded manual supplier submission ${reference} for ${order.code}`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "order",
    entityId: order.code,
    meta: { reference },
  });
  refresh(storeId, orderId);
  return { status: "success", message: t("inProduction", { code: order.code, reference }) };
}

type Carrier = "dhl" | "fedex" | "ups";
const CARRIERS: Carrier[] = ["dhl", "fedex", "ups"];

/**
 * Hands one order to the carrier: records the tracking, the audit entry and
 * the shopper's shipping email. Returns the reason when it cannot.
 */
async function shipOne(
  { user, store }: Access,
  order: Order,
  carrier: Carrier,
  entered: string,
): Promise<{ message: string; field: string } | null> {
  const t = await getTranslations("actions.orders");
  const enabled = store.carriers.find((c) => c.carrier === carrier && c.enabled);
  if (!enabled) {
    return { message: t("carrierDisabled", { carrier: CARRIER_LABELS[carrier] }), field: "carrier" };
  }
  const trackingNumber = entered || trackingNumberFor(carrier, order.code);
  if (trackingNumber.length < 6) {
    return { message: t("trackingTooShort"), field: "trackingNumber" };
  }

  const storeId = store.id;
  const trackingUrl = TRACKING_URLS[carrier](trackingNumber);
  await updateOrder(order.id, {
    status: "shipped",
    fulfillment: { ...order.fulfillment, carrier, trackingNumber, trackingUrl },
    events: [
      ...order.events,
      event("Shipped", `Handed to ${CARRIER_LABELS[carrier]}, tracking ${trackingNumber}.`, user.name),
    ],
  });
  recordAudit({
    category: "order_routing",
    action: "order.shipped",
    summary: `${order.code} shipped with ${CARRIER_LABELS[carrier]} (${trackingNumber})`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
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

  refresh(storeId, order.id);
  return null;
}

export async function addTracking(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const carrier = String(formData.get("carrier") ?? "") as Carrier;
  const trackingNumber = String(formData.get("trackingNumber") ?? "").trim();
  const t = await getTranslations("actions.orders");

  if (!CARRIERS.includes(carrier)) {
    return { status: "error", message: t("chooseCarrier"), field: "carrier" };
  }

  const { order, ...access } = await load(storeId, orderId);
  const failure = await shipOne(access, order, carrier, trackingNumber);
  if (failure) return { status: "error", ...failure };
  return { status: "success", message: t("trackingAdded") };
}

/** Moves one order to the status asked for; false when the status rules do not allow it. */
async function moveOne({ user, store }: Access, order: Order, status: OrderStatus): Promise<boolean> {
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
    events: [...order.events, event(status.replace("_", " "), notes[status] ?? "", user.name)],
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
    actorId: user.id,
    actorName: user.name,
    entity: "order",
    entityId: order.code,
    meta: { status },
  });
  if (status === "cancelled") refreshCustomers(store, [order.customer.email]);
  refresh(store.id, order.id);
  return true;
}

export async function advanceStatus(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const status = String(formData.get("status") ?? "") as OrderStatus;
  const allowed: OrderStatus[] = ["in_production", "shipped", "delivered", "cancelled", "exception", "paid"];
  if (!allowed.includes(status)) return;

  const { order, ...access } = await load(storeId, orderId);
  await moveOne(access, order, status);
}

export async function raiseException(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const t = await getTranslations("actions.orders");
  if (note.length < 5) {
    return { status: "error", message: t("describeProblem"), field: "note" };
  }

  const { user, store, order } = await load(storeId, orderId);
  await updateOrder(orderId, {
    status: "exception",
    fulfillment: { ...order.fulfillment, exception: note },
    events: [...order.events, event("Exception raised", note, user.name)],
  });
  recordAudit({
    category: "order_routing",
    action: "order.exception",
    summary: `Raised an exception on ${order.code}: ${note}`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "order",
    entityId: order.code,
    meta: {},
    notify: { type: "order_exception", href: `/app/stores/${storeId}/orders/${orderId}`, params: { code: order.code } },
  });
  refresh(storeId, orderId);
  return { status: "success", message: t("exceptionRecorded") };
}

export async function resolveException(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const { user, store, order } = await load(storeId, orderId);
  if (!order.fulfillment.exception && order.status !== "exception") return;

  await updateOrder(orderId, {
    status: order.fulfillment.routing === "submitted" ? "in_production" : "paid",
    fulfillment: { ...order.fulfillment, exception: null },
    events: [...order.events, event("Exception resolved", "Marked resolved by the store team.", user.name)],
  });
  recordAudit({
    category: "order_routing",
    action: "order.exception_resolved",
    summary: `Resolved the exception on ${order.code}`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "order",
    entityId: order.code,
    meta: {},
  });
  refresh(storeId, orderId);
}

export async function recordRefund(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "");
  const cancel = formData.get("cancel") === "on";

  const { user, store, order } = await load(storeId, orderId);
  const [t, locale] = await Promise.all([getTranslations("actions.orders"), getLocale()]);
  const amount = parseMoney(amountRaw, order.currency);
  if (amount === null || amount <= 0) {
    return { status: "error", message: t("amountRequired"), field: "amount" };
  }
  const alreadyRefunded = order.refunds.reduce((sum, r) => sum + r.amount, 0);
  if (amount + alreadyRefunded > order.total) {
    return {
      status: "error",
      message: t("overTotal", { total: formatMoney(order.total, order.currency, locale) }),
      field: "amount",
    };
  }
  if (reason.length < 4) {
    return { status: "error", message: t("reasonRequired"), field: "reason" };
  }
  if (order.payment.status !== "succeeded" && order.payment.status !== "refunded") {
    return { status: "error", message: t("noPayment") };
  }

  // Money first: nothing is recorded unless the gateway actually returned it.
  // The key makes a double submit land as one refund at the gateway too — the
  // already-refunded total is part of it, so a genuine second refund differs.
  const gateway = await refundCharge({
    store,
    paymentIntentId: order.payment.paymentIntentId,
    amount,
    currency: order.currency,
    idempotencyKey: `${order.id}:${alreadyRefunded}:${amount}`,
  });
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
              : gateway.message;
    return { status: "error", message };
  }

  const refunds = [
    ...order.refunds,
    {
      id: newId("ref"),
      amount,
      reason,
      at: new Date().toISOString(),
      actor: user.name,
      gatewayRefundId: gateway.refundId ?? undefined,
    },
  ];
  const fullyRefunded = refunds.reduce((sum, r) => sum + r.amount, 0) >= order.total;

  const written = await updateOrder(
    orderId,
    {
      refunds,
      status: cancel ? "cancelled" : order.status,
      payment: { ...order.payment, status: fullyRefunded ? "refunded" : order.payment.status },
      events: [
        ...order.events,
        event(
          cancel ? "Cancelled and refunded" : "Refund issued",
          `${formatMoney(amount, order.currency)} refunded (${gateway.refundId}): ${reason}`,
          user.name,
        ),
      ],
    },
    { updatedAt: order.updatedAt },
  );
  if (!written) {
    // The order moved under us. The gateway call was idempotent, so the refund
    // that did land is already on the reloaded order.
    refresh(storeId, orderId);
    return { status: "error", message: t("orderChanged") };
  }
  recordAudit({
    category: "order_routing",
    action: cancel ? "order.cancelled_refunded" : "order.refunded",
    summary: `${cancel ? "Cancelled and refunded" : "Refunded"} ${formatMoney(amount, order.currency)} on ${order.code}: ${reason}`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "order",
    entityId: order.code,
    meta: { amount, reason, gatewayRefundId: gateway.refundId },
    notify: {
      type: "refund_recorded",
      href: `/app/stores/${storeId}/orders/${orderId}`,
      params: { code: order.code, amount, currency: order.currency },
    },
  });
  refreshCustomers(store, [order.customer.email]);
  refresh(storeId, orderId);
  return {
    status: "success",
    message: t(cancel ? "refundedCancelled" : "refunded", {
      amount: formatMoney(amount, order.currency, locale),
      reference: gateway.refundId ?? "",
    }),
  };
}

/* ------------------------------------------------------------ bulk actions */

/** What a bulk action did to each selected order. */
export interface BulkOutcome {
  /** Set when the whole request was refused, e.g. a signed-out session. */
  error?: string;
  succeeded: { id: string; code: string }[];
  failed: { id: string; code: string; reason: string }[];
}

/**
 * Runs `work` over the selected orders of one store, a few at a time, and
 * reports each one. Every order goes through the same helper its own page
 * uses, so each gets its own events, audit entry and shopper email. `work`
 * returns null when the order was handled, or the reason it was not.
 */
async function forEachOrder(
  storeId: string,
  orderIds: unknown,
  work: (access: Access, order: Order, blocked: (reason: BulkBlock) => string) => Promise<string | null>,
): Promise<BulkOutcome> {
  const [t, labels] = await Promise.all([getTranslations("orders.bulk"), getTranslations("labels")]);
  let access: Access;
  try {
    access = await assertStoreAccess(storeId, "store.orders");
  } catch (error) {
    return { error: error instanceof Error ? error.message : t("failedGeneric"), succeeded: [], failed: [] };
  }
  const ids = parseOrderIds(orderIds);
  if (ids.length === 0) return { error: t("noneSelected"), succeeded: [], failed: [] };

  const orders = await getStoreOrders(storeId, ids);
  const outcome: BulkOutcome = { succeeded: [], failed: [] };
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
          reason = await work(access, order, blocked);
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
  storeId: string,
  shipments: { orderId: string; carrier: string; trackingNumber: string }[],
): Promise<BulkOutcome> {
  const list = Array.isArray(shipments) ? shipments : [];
  const byId = new Map(list.map((entry) => [String(entry?.orderId ?? ""), entry]));
  const t = await getTranslations("actions.orders");

  return forEachOrder(storeId, [...byId.keys()], async (access, order, blocked) => {
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
    const failure = await shipOne(access, order, carrier, trackingNumber);
    return failure?.message ?? null;
  });
}

/** Moves the selected orders on to one status, where the status rules allow it. */
export async function bulkAdvanceOrders(storeId: string, orderIds: string[], status: BulkStatus): Promise<BulkOutcome> {
  if (!BULK_STATUSES.includes(status)) {
    const t = await getTranslations("orders.bulk");
    return { error: t("failedGeneric"), succeeded: [], failed: [] };
  }
  return forEachOrder(storeId, orderIds, async (access, order, blocked) => {
    const block = moveBlock(order, status);
    if (block) return blocked(block);
    return (await moveOne(access, order, status)) ? null : blocked("cannotMove");
  });
}

/** Sends the selected paid orders to their suppliers through automatic routing. */
export async function bulkRouteOrders(storeId: string, orderIds: string[]): Promise<BulkOutcome> {
  return forEachOrder(storeId, orderIds, async (access, order, blocked) => {
    const block = routeBlock(order);
    if (block) return blocked(block);
    const decision = await routeOne(access, order);
    return decision.routing === "submitted" ? null : decision.message;
  });
}

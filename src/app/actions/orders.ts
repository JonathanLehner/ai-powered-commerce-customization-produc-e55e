"use server";

import { revalidatePath } from "next/cache";
import { getOrder, getSupplier, recordAudit, updateOrder } from "@/lib/data";
import { routeOrder, submitToSupplier, trackingNumberFor } from "@/lib/fulfillment";
import { assertStoreAccess } from "@/lib/session";
import type { FulfillmentEvent, Order, OrderStatus } from "@/lib/types";
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

/** Re-runs supplier routing, e.g. after a carrier or supplier problem is fixed. */
export async function routeToSupplier(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const { user, store, order } = await load(storeId, orderId);

  const decision = await routeOrder(order, store);
  const events = [...order.events, event(
    decision.routing === "submitted" ? "Sent to supplier" : "Manual handling required",
    decision.message,
    user.name,
  )];

  await updateOrder(orderId, {
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
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "order",
    entityId: order.code,
    meta: { routing: decision.routing },
  });
  refresh(storeId, orderId);
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

  if (!supplierId) {
    return { status: "error", message: "Choose the supplier that will produce this order.", field: "supplierId" };
  }
  if (reason.length < 4) {
    return { status: "error", message: "Give a short reason — it appears in the audit history.", field: "reason" };
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
      message: `${order.code} is already with ${order.fulfillment.supplierName} (${order.fulfillment.supplierOrderRef}).`,
    };
  }

  const supplier = await getSupplier(supplierId);
  if (!supplier) {
    return { status: "error", message: "That supplier is no longer on the platform.", field: "supplierId" };
  }

  const decision = await submitToSupplier(order, store, supplier);
  if (decision.routing !== "submitted") {
    return { status: "error", message: decision.message, field: "supplierId" };
  }

  const from = order.fulfillment.supplierName;
  const at = new Date().toISOString();
  const summary = from
    ? `Rerouted from ${from} to ${supplier.name} — ${reason}.`
    : `Routed to ${supplier.name} — ${reason}.`;

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
    message: `${supplier.name} accepted ${order.code} as ${decision.supplierOrderRef}.`,
  };
}

export async function recordManualSubmission(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const reference = String(formData.get("reference") ?? "").trim();
  if (reference.length < 3) {
    return { status: "error", message: "Enter the supplier's purchase order reference.", field: "reference" };
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
  return { status: "success", message: `${order.code} is now in production against ${reference}.` };
}

export async function addTracking(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const carrier = String(formData.get("carrier") ?? "") as "dhl" | "fedex" | "ups";
  let trackingNumber = String(formData.get("trackingNumber") ?? "").trim();

  if (!["dhl", "fedex", "ups"].includes(carrier)) {
    return { status: "error", message: "Choose the carrier that collected the parcel.", field: "carrier" };
  }

  const { user, store, order } = await load(storeId, orderId);
  const enabled = store.carriers.find((c) => c.carrier === carrier && c.enabled);
  if (!enabled) {
    return {
      status: "error",
      message: `${CARRIER_LABELS[carrier]} is not enabled for this store. Turn it on in store settings first.`,
      field: "carrier",
    };
  }
  if (!trackingNumber) trackingNumber = trackingNumberFor(carrier, order.code);
  if (trackingNumber.length < 6) {
    return { status: "error", message: "Tracking numbers are at least 6 characters.", field: "trackingNumber" };
  }

  await updateOrder(orderId, {
    status: "shipped",
    fulfillment: {
      ...order.fulfillment,
      carrier,
      trackingNumber,
      trackingUrl: TRACKING_URLS[carrier](trackingNumber),
    },
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
  refresh(storeId, orderId);
  return { status: "success", message: `Tracking added. The shopper can now follow ${trackingNumber}.` };
}

export async function advanceStatus(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const status = String(formData.get("status") ?? "") as OrderStatus;
  const allowed: OrderStatus[] = ["in_production", "shipped", "delivered", "cancelled", "exception", "paid"];
  if (!allowed.includes(status)) return;

  const { user, store, order } = await load(storeId, orderId);
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

  await updateOrder(orderId, patch);
  recordAudit({
    category: "order_routing",
    action: `order.${status}`,
    summary: `Set ${order.code} to ${status.replace("_", " ")}`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "order",
    entityId: order.code,
    meta: { status },
  });
  refresh(storeId, orderId);
}

export async function raiseException(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (note.length < 5) {
    return { status: "error", message: "Describe the problem so whoever picks this up has context.", field: "note" };
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
  });
  refresh(storeId, orderId);
  return { status: "success", message: "Exception recorded. The order now shows in the attention queue." };
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
  const amount = parseMoney(amountRaw, order.currency);
  if (amount === null || amount <= 0) {
    return { status: "error", message: "Enter the refund amount.", field: "amount" };
  }
  const alreadyRefunded = order.refunds.reduce((sum, r) => sum + r.amount, 0);
  if (amount + alreadyRefunded > order.total) {
    return {
      status: "error",
      message: `That would refund more than the order total of ${formatMoney(order.total, order.currency)}.`,
      field: "amount",
    };
  }
  if (reason.length < 4) {
    return { status: "error", message: "Give a short reason — it appears in the audit history.", field: "reason" };
  }

  const refunds = [
    ...order.refunds,
    { id: newId("ref"), amount, reason, at: new Date().toISOString(), actor: user.name },
  ];
  const fullyRefunded = refunds.reduce((sum, r) => sum + r.amount, 0) >= order.total;

  await updateOrder(orderId, {
    refunds,
    status: cancel ? "cancelled" : order.status,
    payment: { ...order.payment, status: fullyRefunded ? "refunded" : order.payment.status },
    events: [
      ...order.events,
      event(
        cancel ? "Cancelled and refunded" : "Refund issued",
        `${formatMoney(amount, order.currency)} refunded — ${reason}`,
        user.name,
      ),
    ],
  });
  recordAudit({
    category: "order_routing",
    action: cancel ? "order.cancelled_refunded" : "order.refunded",
    summary: `${cancel ? "Cancelled and refunded" : "Refunded"} ${formatMoney(amount, order.currency)} on ${order.code} — ${reason}`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "order",
    entityId: order.code,
    meta: { amount, reason },
  });
  refresh(storeId, orderId);
  return {
    status: "success",
    message: `${formatMoney(amount, order.currency)} refunded${cancel ? " and the order was cancelled" : ""}.`,
  };
}

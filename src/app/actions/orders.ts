"use server";

import { getLocale, getTranslations } from "next-intl/server";
import type { BulkStatus } from "@/lib/bulk-orders";
import { getOrder } from "@/lib/data";
import { refusal } from "@/lib/operations/action-state";
import { isOperationError, type OperationContext } from "@/lib/operations/context";
import {
  CARRIERS,
  bulkAdvanceOrders as advanceMany,
  bulkRouteOrders as routeMany,
  bulkShipOrders as shipMany,
  fulfilOrder as fulfil,
  moveOrder,
  raiseException as raise,
  recordManualSubmission as recordManual,
  refundOrder,
  rerouteToSupplier as reroute,
  resolveException as resolve,
  routeToSupplier as route,
  saveCheckoutRecovery as saveRecovery,
  saveOrderNotes as saveNotes,
  shipOrder,
  updateShippingAddress as updateAddress,
  type BulkResult,
  type Carrier,
} from "@/lib/operations/orders";
import { assertStoreAccess, operationContext } from "@/lib/session";
import type { OrderStatus } from "@/lib/types";
import { formatMoney, parseMoney } from "@/lib/util";
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

/** Re-runs supplier routing, e.g. after a carrier or supplier problem is fixed. */
export async function routeToSupplier(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const { order, ...access } = await load(storeId, orderId);
  await route(await operationContext(access), order);
}

/**
 * Sends the job to a supplier the order manager picked, for the orders
 * automatic routing cannot place. The operation re-checks the choice against
 * the live supplier records and reports a repeated identical reroute as done.
 */
export async function rerouteToSupplier(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const t = await getTranslations("actions.orders");
  const { order, ...access } = await load(storeId, orderId);
  try {
    const result = await reroute(await operationContext(access), order, {
      supplierId: String(formData.get("supplierId") ?? ""),
      reason: String(formData.get("reason") ?? ""),
    });
    return {
      status: "success",
      message: result.already
        ? t("alreadyWith", { code: order.code, supplier: result.supplierName, reference: result.reference })
        : t("accepted", { supplier: result.supplierName, code: order.code, reference: result.reference }),
    };
  } catch (error) {
    return refusal(error);
  }
}

export async function recordManualSubmission(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const t = await getTranslations("actions.orders");
  const { order, ...access } = await load(storeId, orderId);
  try {
    const reference = await recordManual(await operationContext(access), order, String(formData.get("reference") ?? ""));
    return { status: "success", message: t("inProduction", { code: order.code, reference }) };
  } catch (error) {
    return refusal(error);
  }
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

  // The line-item form posts a quantity per line; without them, everything left ships.
  const lines = [...formData.entries()]
    .filter(([name]) => name.startsWith("quantity_"))
    .map(([name, value]) => ({ itemId: name.slice("quantity_".length), quantity: Number(String(value).trim() || "0") }));

  const { order, ...access } = await load(storeId, orderId);
  try {
    const ctx = await operationContext(access);
    if (lines.length > 0) {
      const { complete } = await fulfil(ctx, order, { carrier, trackingNumber, lines });
      return { status: "success", message: t(complete ? "trackingAdded" : "partShipped") };
    }
    await shipOrder(ctx, order, carrier, trackingNumber);
  } catch (error) {
    return refusal(error);
  }
  return { status: "success", message: t("trackingAdded") };
}

/** The team's note and tags on an order. */
export async function saveOrderNotes(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const t = await getTranslations("actions.orders");
  const { order, ...access } = await load(storeId, orderId);
  try {
    await saveNotes(await operationContext(access), order, {
      note: String(formData.get("note") ?? ""),
      tags: String(formData.get("tags") ?? ""),
    });
  } catch (error) {
    return refusal(error);
  }
  return { status: "success", message: t("notesSaved") };
}

/** Corrects the shipping address before anything has shipped. */
export async function updateShippingAddress(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const t = await getTranslations("actions.orders");
  const { order, ...access } = await load(storeId, orderId);
  try {
    await updateAddress(await operationContext(access), order, {
      name: formData.get("name"),
      line1: formData.get("line1"),
      line2: formData.get("line2"),
      city: formData.get("city"),
      region: formData.get("region"),
      postalCode: formData.get("postalCode"),
      country: formData.get("country"),
      phone: formData.get("phone"),
    });
  } catch (error) {
    return refusal(error);
  }
  return { status: "success", message: t("addressSaved") };
}

/** The abandoned checkout email: on or off, and how many hours after checkout. */
export async function saveCheckoutRecovery(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, "store.settings");
  const t = await getTranslations("actions.orders");
  try {
    const settings = await saveRecovery(await operationContext(access), {
      enabled: formData.get("enabled") === "on",
      delayHours: formData.get("delayHours"),
    });
    return { status: "success", message: t(settings.enabled ? "recoveryOn" : "recoveryOff") };
  } catch (error) {
    return refusal(error);
  }
}

export async function advanceStatus(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const status = String(formData.get("status") ?? "") as OrderStatus;
  const allowed: OrderStatus[] = ["in_production", "shipped", "delivered", "cancelled", "exception", "paid"];
  if (!allowed.includes(status)) return;

  const { order, ...access } = await load(storeId, orderId);
  await moveOrder(await operationContext(access), order, status, formData.get("notify") === "on");
}

export async function raiseException(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const t = await getTranslations("actions.orders");
  const { order, ...access } = await load(storeId, orderId);
  try {
    await raise(await operationContext(access), order, String(formData.get("note") ?? ""));
  } catch (error) {
    return refusal(error);
  }
  return { status: "success", message: t("exceptionRecorded") };
}

export async function resolveException(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const { order, ...access } = await load(storeId, orderId);
  await resolve(await operationContext(access), order);
}

export async function recordRefund(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const cancel = formData.get("cancel") === "on";

  const { order, ...access } = await load(storeId, orderId);
  const [t, locale] = await Promise.all([getTranslations("actions.orders"), getLocale()]);
  try {
    const refund = await refundOrder(await operationContext(access), order, {
      amount: parseMoney(String(formData.get("amount") ?? ""), order.currency),
      reason: String(formData.get("reason") ?? ""),
      cancel,
      lines: order.items.map((item) => ({
        itemId: item.id,
        quantity: Number(formData.get(`refund_qty_${item.id}`) || 0),
        restock: formData.get(`refund_restock_${item.id}`) === "on",
      })),
      shipping: parseMoney(String(formData.get("shipping") || "0"), order.currency),
      notify: formData.get("notify") === "on",
    });
    return {
      status: "success",
      message: t(cancel ? "refundedCancelled" : "refunded", {
        amount: formatMoney(refund.amount, order.currency, locale),
        reference: refund.refundId ?? "",
      }),
    };
  } catch (error) {
    return refusal(error);
  }
}

/* ------------------------------------------------------------ bulk actions */

/** What a bulk action did to each selected order. */
export interface BulkOutcome extends BulkResult {
  /** Set when the whole request was refused, e.g. a signed-out session. */
  error?: string;
}

/**
 * Runs a bulk operation for the Orders page: the same access check as a
 * single order, and the whole request's refusal as `error`.
 */
async function bulk(storeId: string, run: (ctx: OperationContext) => Promise<BulkResult>): Promise<BulkOutcome> {
  const t = await getTranslations("orders.bulk");
  let access: Awaited<ReturnType<typeof assertStoreAccess>>;
  try {
    access = await assertStoreAccess(storeId, "store.orders");
  } catch (error) {
    return { error: error instanceof Error ? error.message : t("failedGeneric"), succeeded: [], failed: [] };
  }
  try {
    return await run(await operationContext(access));
  } catch (error) {
    if (isOperationError(error)) return { error: error.message, succeeded: [], failed: [] };
    throw error;
  }
}

/** Marks the selected orders shipped, each with its own carrier and tracking number. */
export async function bulkShipOrders(
  storeId: string,
  shipments: { orderId: string; carrier: string; trackingNumber: string }[],
): Promise<BulkOutcome> {
  return bulk(storeId, (ctx) => shipMany(ctx, shipments));
}

/** Moves the selected orders on to one status, where the status rules allow it. */
export async function bulkAdvanceOrders(storeId: string, orderIds: string[], status: BulkStatus): Promise<BulkOutcome> {
  return bulk(storeId, (ctx) => advanceMany(ctx, orderIds, status));
}

/** Sends the selected paid orders to their suppliers through automatic routing. */
export async function bulkRouteOrders(storeId: string, orderIds: string[]): Promise<BulkOutcome> {
  return bulk(storeId, (ctx) => routeMany(ctx, orderIds));
}

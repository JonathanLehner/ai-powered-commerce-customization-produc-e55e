import "server-only";
import { z } from "zod";
import { BULK_ORDER_LIMIT, BULK_STATUSES } from "../../bulk-orders";
import { routingOptionsFor } from "../../fulfillment";
import type { OperationContext } from "../../operations/context";
import {
  CARRIERS,
  bulkAdvanceOrders,
  bulkRouteOrders,
  bulkShipOrders,
  findOrder,
  raiseException,
  recordManualSubmission,
  rerouteToSupplier,
  resolveException,
  routeToSupplier,
} from "../../operations/orders";
import { listAbandonedCheckouts } from "../../checkout-recovery";
import { saveCheckoutRecovery, saveOrderNotes, updateShippingAddress } from "../../operations/orders";
import { MAX_NOTE_LENGTH, MAX_TAGS, RECOVERY_DELAY_MAX, RECOVERY_DELAY_MIN, recoverySettings, recoveryState } from "../../order-ops";
import type { Order } from "../../types";
import { define, id, notFound, type ApiOperation } from "../define";
import { presentOrder } from "../present";

/**
 * Order fulfilment beyond shipping and refunds: sending orders to suppliers,
 * picking another supplier, recording manual purchase orders, exceptions, and
 * the Orders page's bulk actions.
 */

async function order(ctx: OperationContext, orderId: string): Promise<Order> {
  return (await findOrder(ctx.store.id, orderId)) ?? notFound("Order");
}

const orderIds = z
  .array(z.string().min(1))
  .min(1)
  .max(BULK_ORDER_LIMIT)
  .describe(`Order ids, up to ${BULK_ORDER_LIMIT}. Repeated ids count once.`);

const bulkResult =
  "Returns `succeeded` and `failed` lists, one entry per order with its id and code; each failed entry carries the reason it was skipped. Ids not in this store are reported as failed.";

export const orderOperations: ApiOperation[] = [
  define({
    id: "updateOrderNotes",
    method: "PATCH",
    path: "/orders/{orderId}/notes",
    scope: "orders:write",
    tag: "Orders",
    summary: "Set an order's note and tags",
    description: `The store team's own note and tags on the order, never shown to the shopper. Tags are trimmed and kept once each, whatever their case, up to ${MAX_TAGS}. Leave a field out to keep it as it is.`,
    input: z.object({
      orderId: id("order"),
      note: z.string().max(MAX_NOTE_LENGTH).optional().describe("Replaces the note; an empty string clears it."),
      tags: z.array(z.string()).optional().describe("Replaces the tags; an empty list clears them."),
    }),
    actions: ["orders#saveOrderNotes"],
    run: async (ctx, { orderId, ...input }) => presentOrder(await saveOrderNotes(ctx, await order(ctx, orderId), input)),
  }),
  define({
    id: "updateOrderShippingAddress",
    method: "PUT",
    path: "/orders/{orderId}/shipping-address",
    scope: "orders:write",
    tag: "Orders",
    summary: "Change an order's shipping address",
    description:
      "Replaces the address the order ships to. Refused with 409 once any part of the order has shipped, or when it is cancelled. A region is needed for countries whose addresses have one (US states, Canadian provinces, Japanese prefectures).",
    input: z.object({
      orderId: id("order"),
      name: z.string(),
      line1: z.string(),
      line2: z.string().optional(),
      city: z.string(),
      region: z.string().optional(),
      postalCode: z.string(),
      country: z.string().describe("Two-letter ISO country code, such as DE."),
      phone: z.string().optional(),
    }),
    actions: ["orders#updateShippingAddress"],
    run: async (ctx, { orderId, ...address }) =>
      presentOrder(await updateShippingAddress(ctx, await order(ctx, orderId), address)),
  }),
  define({
    id: "listAbandonedCheckouts",
    method: "GET",
    path: "/abandoned-checkouts",
    scope: "orders:read",
    tag: "Orders",
    summary: "List abandoned checkouts",
    description:
      "Checkouts that expired without payment, newest first, with the shopper's email, items and total. `recovery` is recovered (paid later), sent, scheduled, noConsent (the shopper did not agree to emails), off, or expired (too old to email).",
    input: z.object({}),
    run: async (ctx) => {
      const settings = recoverySettings(ctx.store);
      const now = new Date();
      return {
        settings,
        data: (await listAbandonedCheckouts(ctx.store.id)).map((row) => ({
          id: row.id,
          code: row.code,
          abandonedAt: row.abandoned?.at ?? null,
          email: row.customer.email,
          name: row.customer.name,
          currency: row.currency,
          total: row.total,
          items: row.items.map((item) => ({ productName: item.productName, variantName: item.variantName, quantity: item.quantity })),
          marketingConsent: Boolean(row.marketingConsent),
          recovery: recoveryState(row, settings, now),
          recoveryEmailAt: row.abandoned?.recoveryEmailAt ?? null,
          recoveredOrderId: row.abandoned?.recoveredOrderId ?? null,
        })),
      };
    },
  }),
  define({
    id: "updateCheckoutRecovery",
    method: "PUT",
    path: "/abandoned-checkouts/settings",
    scope: "store:write",
    tag: "Orders",
    summary: "Set the abandoned checkout email",
    description: `Turns the one recovery email on or off and sets how many hours (${RECOVERY_DELAY_MIN} to ${RECOVERY_DELAY_MAX}) after the checkout expired it goes. It links back to the restored basket, and only goes to shoppers who agreed at checkout to emails from the store. Checkouts abandoned before it was turned on are not emailed.`,
    input: z.object({
      enabled: z.boolean(),
      delayHours: z.number().int().min(RECOVERY_DELAY_MIN).max(RECOVERY_DELAY_MAX),
    }),
    actions: ["orders#saveCheckoutRecovery"],
    run: async (ctx, input) => saveCheckoutRecovery(ctx, input),
  }),
  define({
    id: "getOrderRoutingOptions",
    method: "GET",
    path: "/orders/{orderId}/routing-options",
    scope: "orders:read",
    tag: "Orders",
    summary: "List the suppliers an order could go to",
    description:
      "The approved suppliers that produce every item on the order for its destination region, other than the one holding it now: `available` take the job through their order API (use rerouteOrder with one of their ids), `manualOnly` need a purchase order raised by hand (then recordSupplierSubmission). Also the destination region, what the order needs produced, and whether the store has a carrier enabled.",
    input: z.object({ orderId: id("order") }),
    run: async (ctx, input) => routingOptionsFor(await order(ctx, input.orderId), ctx.store),
  }),
  define({
    id: "routeOrderToSupplier",
    method: "POST",
    path: "/orders/{orderId}/routing",
    scope: "orders:write",
    tag: "Orders",
    summary: "Send an order to its supplier",
    description:
      "Runs automatic supplier routing for the order, for instance again after a carrier or supplier problem is fixed. `routing` is submitted when a supplier accepted the job (the order moves to in_production), or manual_required with the reason in `message`. Nothing is recorded when the order is already in exception or routing reaches the same result as last time.",
    input: z.object({ orderId: id("order") }),
    actions: ["orders#routeToSupplier"],
    run: async (ctx, input) => {
      const decision = await routeToSupplier(ctx, await order(ctx, input.orderId));
      return { routing: decision.routing, message: decision.message, order: presentOrder(await order(ctx, input.orderId)) };
    },
  }),
  define({
    id: "rerouteOrder",
    method: "POST",
    path: "/orders/{orderId}/reroute",
    scope: "orders:write",
    tag: "Orders",
    summary: "Send an order to another supplier",
    description:
      "Hands the job to a supplier you pick, for orders automatic routing could not place. Pick from the `available` list of getOrderRoutingOptions; the choice is re-checked against the live supplier records. Repeating the same supplier and reason changes nothing and returns `alreadyDone: true`.",
    input: z.object({
      orderId: id("order"),
      supplierId: id("supplier").describe("A supplier id from getOrderRoutingOptions `available`."),
      reason: z.string().describe("Why the job moves, at least 4 characters. Shown in the order history."),
    }),
    actions: ["orders#rerouteToSupplier"],
    run: async (ctx, { orderId, ...input }) => {
      const result = await rerouteToSupplier(ctx, await order(ctx, orderId), input);
      return {
        alreadyDone: result.already,
        supplierName: result.supplierName,
        supplierOrderRef: result.reference,
        order: presentOrder(await order(ctx, orderId)),
      };
    },
  }),
  define({
    id: "recordSupplierSubmission",
    method: "POST",
    path: "/orders/{orderId}/supplier-submission",
    scope: "orders:write",
    tag: "Orders",
    summary: "Record a manual purchase order",
    description:
      "Records the reference of a purchase order raised with the supplier by hand, for suppliers without an order API, and moves the order to in_production. Recording the reference already on the order changes nothing.",
    input: z.object({
      orderId: id("order"),
      reference: z.string().describe("The supplier's purchase order reference, at least 3 characters."),
    }),
    actions: ["orders#recordManualSubmission"],
    run: async (ctx, input) => {
      await recordManualSubmission(ctx, await order(ctx, input.orderId), input.reference);
      return presentOrder(await order(ctx, input.orderId));
    },
  }),
  define({
    id: "raiseOrderException",
    method: "POST",
    path: "/orders/{orderId}/exception",
    scope: "orders:write",
    tag: "Orders",
    summary: "Flag a problem on an order",
    description:
      "Moves the order to exception with a note describing the problem, and notifies the store team. Repeating the note on an order already in exception for it changes nothing.",
    input: z.object({
      orderId: id("order"),
      note: z.string().describe("What is wrong, at least 5 characters. Shown in the order history."),
    }),
    actions: ["orders#raiseException"],
    run: async (ctx, input) => {
      await raiseException(ctx, await order(ctx, input.orderId), input.note);
      return presentOrder(await order(ctx, input.orderId));
    },
  }),
  define({
    id: "resolveOrderException",
    method: "DELETE",
    path: "/orders/{orderId}/exception",
    scope: "orders:write",
    tag: "Orders",
    summary: "Resolve an order's problem",
    description:
      "Clears the order's exception: back to in_production when a supplier holds the job, otherwise to paid. `resolved` is false when the order had no exception.",
    input: z.object({ orderId: id("order") }),
    actions: ["orders#resolveException"],
    run: async (ctx, input) => {
      const resolved = await resolveException(ctx, await order(ctx, input.orderId));
      return { resolved, order: presentOrder(await order(ctx, input.orderId)) };
    },
  }),
  define({
    id: "bulkShipOrders",
    method: "POST",
    path: "/orders/bulk/shipments",
    scope: "orders:write",
    tag: "Orders",
    summary: "Mark several orders shipped",
    description: `Marks up to ${BULK_ORDER_LIMIT} orders shipped, each with its own carrier and tracking number, and emails each shopper. Orders not yet in production are skipped; an order already shipped with the same tracking is left as it is. ${bulkResult}`,
    input: z.object({
      shipments: z
        .array(
          z.object({
            orderId: id("order"),
            carrier: z.enum(CARRIERS).describe("One of the store's enabled carriers."),
            trackingNumber: z.string().default("").describe("At least 6 characters. Empty uses the carrier's own."),
          }),
        )
        .min(1)
        .max(BULK_ORDER_LIMIT),
    }),
    actions: ["orders#bulkShipOrders"],
    run: async (ctx, input) => bulkShipOrders(ctx, input.shipments),
  }),
  define({
    id: "bulkUpdateOrderStatus",
    method: "POST",
    path: "/orders/bulk/status",
    scope: "orders:write",
    tag: "Orders",
    summary: "Move several orders to a status",
    description: `Moves up to ${BULK_ORDER_LIMIT} orders on to in_production, shipped or delivered, where the status rules allow it. ${bulkResult}`,
    input: z.object({ orderIds, status: z.enum(BULK_STATUSES) }),
    actions: ["orders#bulkAdvanceOrders"],
    run: async (ctx, input) => bulkAdvanceOrders(ctx, input.orderIds, input.status),
  }),
  define({
    id: "bulkRouteOrders",
    method: "POST",
    path: "/orders/bulk/routing",
    scope: "orders:write",
    tag: "Orders",
    summary: "Send several paid orders to suppliers",
    description: `Runs automatic supplier routing for up to ${BULK_ORDER_LIMIT} orders. Orders that are not paid are skipped; one routing could not place fails with the reason. ${bulkResult}`,
    input: z.object({ orderIds }),
    actions: ["orders#bulkRouteOrders"],
    run: async (ctx, input) => bulkRouteOrders(ctx, input.orderIds),
  }),
];

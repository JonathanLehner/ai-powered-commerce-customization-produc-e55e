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
      "Runs automatic supplier routing for the order, for instance again after a carrier or supplier problem is fixed. `routing` is submitted when a supplier accepted the job (the order moves to in_production), or manual_required with the reason in `message`.",
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
      "Records the reference of a purchase order raised with the supplier by hand, for suppliers without an order API, and moves the order to in_production.",
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
    description: "Moves the order to exception with a note describing the problem, and notifies the store team.",
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

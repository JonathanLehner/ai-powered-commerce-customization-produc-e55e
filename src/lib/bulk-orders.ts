/**
 * Which of the selected orders a bulk action on the Orders page can touch.
 *
 * Pure, so the toolbar can say up front which rows an action will skip and the
 * server action can refuse the same rows for the same reason — and
 * `npm run bulk-orders-check` covers both without a database.
 */
import { canMoveOrder, type Order, type OrderStatus } from "./types";

/** The most orders one bulk action takes: a few pages of the queue. */
export const BULK_ORDER_LIMIT = 100;

/** The statuses "Advance status" offers, in the order a job moves through them. */
export const BULK_STATUSES = ["in_production", "shipped", "delivered"] as const;
export type BulkStatus = (typeof BULK_STATUSES)[number];

type Movable = Pick<Order, "status"> & { payment: Pick<Order["payment"], "status"> };

/** What the toolbar needs to know about a row, without the shopper's details. */
export type BulkOrder = Movable &
  Pick<Order, "id" | "code"> & {
    fulfillment: Pick<Order["fulfillment"], "carrier" | "trackingNumber">;
  };

/**
 * Why a row is skipped, as a key under `orders.bulk.blocked`. The status the
 * order is in is passed alongside, so the message can name it.
 */
export type BulkBlock = "alreadyStatus" | "cannotMove" | "notInProduction" | "notPaid";

/** A parcel can be handed over once production is under way, or re-tracked once shipped. */
export function shipBlock(order: Movable): BulkBlock | null {
  if (order.status === "shipped") return null;
  return canMoveOrder(order, "shipped") ? null : "notInProduction";
}

export function moveBlock(order: Movable, to: OrderStatus): BulkBlock | null {
  if (order.status === to) return "alreadyStatus";
  return canMoveOrder(order, to) ? null : "cannotMove";
}

/** Only paid orders that no supplier holds yet are sent out. */
export function routeBlock(order: Pick<Order, "status">): BulkBlock | null {
  return order.status === "paid" ? null : "notPaid";
}

/**
 * The order ids a request names: trimmed, de-duplicated and capped, so a
 * hand-edited URL or a replayed request cannot ask for an unbounded read.
 */
export function parseOrderIds(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const ids = raw.filter((id): id is string => typeof id === "string").map((id) => id.trim()).filter(Boolean);
  return [...new Set(ids)].slice(0, BULK_ORDER_LIMIT);
}

/** The orders with those ids, in the queue's own order. */
export function pickOrders<T extends Pick<Order, "id">>(orders: T[], ids: string[]): T[] {
  const wanted = new Set(ids);
  return orders.filter((order) => wanted.has(order.id));
}

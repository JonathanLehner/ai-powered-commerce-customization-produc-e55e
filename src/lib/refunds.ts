import type { Order, OrderItem } from "./types";

/**
 * Itemised refunds: which units of which lines go back, whether they return to
 * stock, and how much shipping is refunded. Shared by the refund form, which
 * shows the total as the merchant picks lines, and the refund operation, which
 * checks the same numbers on the server.
 */

export interface RefundLineInput {
  itemId: string;
  quantity: number;
  restock: boolean;
}

/** Units of each line already refunded, by item id. */
export function refundedQuantities(order: Pick<Order, "refunds">): Map<string, number> {
  const out = new Map<string, number>();
  for (const refund of order.refunds) {
    for (const line of refund.lines ?? []) out.set(line.itemId, (out.get(line.itemId) ?? 0) + line.quantity);
  }
  return out;
}

/** Shipping already refunded, in minor units. */
export function refundedShipping(order: Pick<Order, "refunds">): number {
  return order.refunds.reduce((sum, r) => sum + (r.shipping ?? 0), 0);
}

/**
 * What the shopper paid for `quantity` units of a line. Discounts, tax charged
 * on top and gift cards are spread over the goods by price, so the lines add up
 * to what was charged for them.
 */
export function lineRefundAmount(order: Order, item: OrderItem, quantity: number): number {
  if (order.subtotal <= 0 || quantity <= 0) return 0;
  const goodsCharged = Math.max(0, order.total - order.shipping);
  return Math.round((item.unitPrice * quantity * goodsCharged) / order.subtotal);
}

/** The amount to refund for the chosen lines and shipping, capped at what is left to refund. */
export function refundTotal(order: Order, lines: RefundLineInput[], shipping: number): number {
  const remaining = order.total - order.refunds.reduce((sum, r) => sum + r.amount, 0);
  const done = refundedQuantities(order);
  let amount = shipping;
  let everything = shipping + refundedShipping(order) >= order.shipping;
  for (const item of order.items) {
    const quantity = lines.find((line) => line.itemId === item.id)?.quantity ?? 0;
    amount += lineRefundAmount(order, item, quantity);
    if ((done.get(item.id) ?? 0) + quantity < item.quantity) everything = false;
  }
  // Rounding per line can leave a cent behind; the last refund takes all of it.
  return Math.max(0, everything ? remaining : Math.min(amount, remaining));
}

const variantKey = (productId: string, variantId: string) => `${productId}:${variantId}`;

/**
 * Units that can still go back on hand, by tracked variant. Empty unless the
 * order's stock was taken off hand and not already put back in one go.
 */
export function restockableUnits(order: Pick<Order, "inventory" | "items" | "refunds">): Map<string, number> {
  const out = new Map<string, number>();
  const inventory = order.inventory;
  if (inventory?.state !== "committed" || inventory.restockedAt) return out;
  for (const line of inventory.lines) {
    const key = variantKey(line.productId, line.variantId);
    out.set(key, (out.get(key) ?? 0) + line.quantity);
  }
  for (const refund of order.refunds) {
    for (const line of refund.lines ?? []) {
      const item = order.items.find((i) => i.id === line.itemId);
      if (!item || !line.restocked) continue;
      const key = variantKey(item.storeProductId, item.variantId);
      if (out.has(key)) out.set(key, Math.max(0, out.get(key)! - line.restocked));
    }
  }
  return out;
}

/** Whether a line's variant has stock that a refund can put back. */
export function canRestock(restockable: Map<string, number>, item: OrderItem): boolean {
  return (restockable.get(variantKey(item.storeProductId, item.variantId)) ?? 0) > 0;
}

/**
 * How many units of each line go back on hand, never more than the order took
 * off hand for that variant less what earlier refunds already put back.
 */
export function restockPlan(
  order: Pick<Order, "inventory" | "items" | "refunds">,
  lines: { itemId: string; quantity: number }[],
): { itemId: string; productId: string; variantId: string; quantity: number }[] {
  const left = restockableUnits(order);
  const plan = [];
  for (const line of lines) {
    const item = order.items.find((i) => i.id === line.itemId);
    if (!item) continue;
    const key = variantKey(item.storeProductId, item.variantId);
    const quantity = Math.min(line.quantity, left.get(key) ?? 0);
    if (quantity <= 0) continue;
    left.set(key, left.get(key)! - quantity);
    plan.push({ itemId: item.id, productId: item.storeProductId, variantId: item.variantId, quantity });
  }
  return plan;
}

/** True when nothing tracked on the order is left to put back. */
export function fullyRestocked(order: Pick<Order, "inventory" | "items" | "refunds">): boolean {
  return [...restockableUnits(order).values()].every((units) => units === 0);
}

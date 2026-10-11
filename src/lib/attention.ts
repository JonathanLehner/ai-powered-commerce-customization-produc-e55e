/**
 * The one definition of "needs attention", shared by the store overview, the
 * Orders filter, the agency dashboard and the cross-store attention list, so a
 * count on one page always matches the orders another page lists.
 *
 * Each order is counted under a single reason, so the parts of a subtitle add
 * up to its total even when an exception was also held for manual routing.
 */
import type { Order } from "./types";

export type AttentionReason = "exception" | "manual_routing" | "awaiting_production";

export const ATTENTION_REASONS: AttentionReason[] = ["exception", "manual_routing", "awaiting_production"];

export function attentionReason(order: Order): AttentionReason | null {
  if (order.status === "exception") return "exception";
  if (order.fulfillment.routing === "manual_required") return "manual_routing";
  if (order.status === "paid") return "awaiting_production";
  return null;
}

export type AttentionBreakdown = Record<AttentionReason, number> & { total: number };

export function attentionBreakdown(orders: Order[]): AttentionBreakdown {
  const counts: AttentionBreakdown = { exception: 0, manual_routing: 0, awaiting_production: 0, total: 0 };
  for (const order of orders) {
    const reason = attentionReason(order);
    if (!reason) continue;
    counts[reason] += 1;
    counts.total += 1;
  }
  return counts;
}

export function addBreakdowns(breakdowns: AttentionBreakdown[]): AttentionBreakdown {
  const sum: AttentionBreakdown = { exception: 0, manual_routing: 0, awaiting_production: 0, total: 0 };
  for (const b of breakdowns) {
    for (const reason of ATTENTION_REASONS) sum[reason] += b[reason];
    sum.total += b.total;
  }
  return sum;
}

import type { FulfillmentEvent } from "./types";

/**
 * The milestones a shopper sees on their order page.
 *
 * The order's event log is written for the store team: it names suppliers,
 * payment references and routing decisions. The shopper only needs to know
 * where the order has got to, in their own language, so each event is matched
 * to a milestone and everything else is left out.
 */
export type ShopperMilestone =
  | "paid"
  | "inProduction"
  | "partiallyShipped"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";

/** Event titles as written by the app and the demo seed (English and German). */
const MILESTONES: Record<string, ShopperMilestone> = {
  "payment captured": "paid",
  "zahlung eingegangen": "paid",
  "sent to supplier": "inProduction",
  "rerouted to supplier": "inProduction",
  "in production": "inProduction",
  "an die produktion übergeben": "inProduction",
  "partially shipped": "partiallyShipped",
  shipped: "shipped",
  versandt: "shipped",
  delivered: "delivered",
  zugestellt: "delivered",
  cancelled: "cancelled",
  "cancelled and refunded": "cancelled",
  storniert: "cancelled",
  "refund issued": "refunded",
};

export function shopperTimeline(events: FulfillmentEvent[]): { milestone: ShopperMilestone; at: string }[] {
  const seen = new Set<ShopperMilestone>();
  const out: { milestone: ShopperMilestone; at: string }[] = [];
  for (const event of events) {
    const milestone = MILESTONES[event.status.trim().toLowerCase()];
    if (!milestone || (milestone !== "refunded" && seen.has(milestone))) continue;
    seen.add(milestone);
    out.push({ milestone, at: event.at });
  }
  return out;
}

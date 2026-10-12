/**
 * The rules behind working an order by hand: which lines are still to ship,
 * whether its address can still change, how its tags are written, and when an
 * abandoned checkout gets its recovery email.
 *
 * Pure, so the order page, the Admin API and `npm run order-ops-check` read the
 * same answers.
 */
import type { CheckoutRecoverySettings, Order, OrderFulfillment, Store } from "./types";

/**
 * The parcels an order has gone out in. An order shipped before partial
 * fulfilment carries only its tracking, which stands for one parcel of
 * everything.
 */
export function orderFulfillments(
  order: Pick<Order, "fulfillments" | "fulfillment" | "items" | "status" | "events" | "updatedAt">,
): OrderFulfillment[] {
  if (order.fulfillments) return order.fulfillments;
  const { carrier, trackingNumber, trackingUrl } = order.fulfillment;
  if (!carrier || !trackingNumber || (order.status !== "shipped" && order.status !== "delivered")) return [];
  const shipped = [...order.events].reverse().find((event) => event.status === "Shipped");
  return [
    {
      id: "legacy",
      lines: order.items.map((item) => ({ itemId: item.id, quantity: item.quantity })),
      carrier,
      trackingNumber,
      trackingUrl: trackingUrl ?? "",
      at: shipped?.at ?? order.updatedAt,
      actor: shipped?.actor ?? "",
    },
  ];
}

type Fulfillable = Parameters<typeof orderFulfillments>[0];

/** Units of each line already shipped. */
export function shippedQuantities(order: Fulfillable): Map<string, number> {
  const shipped = new Map<string, number>();
  for (const parcel of orderFulfillments(order)) {
    for (const line of parcel.lines) shipped.set(line.itemId, (shipped.get(line.itemId) ?? 0) + line.quantity);
  }
  return shipped;
}

/** Each line with the units still to ship; lines fully shipped are left out. */
export function unshippedLines(order: Fulfillable): { itemId: string; quantity: number }[] {
  const shipped = shippedQuantities(order);
  return order.items
    .map((item) => ({ itemId: item.id, quantity: item.quantity - (shipped.get(item.id) ?? 0) }))
    .filter((line) => line.quantity > 0);
}

export type FulfillmentState = "unfulfilled" | "partial" | "fulfilled";

export function fulfillmentState(order: Fulfillable): FulfillmentState {
  if (orderFulfillments(order).length === 0) return "unfulfilled";
  return unshippedLines(order).length === 0 ? "fulfilled" : "partial";
}

export type FulfillmentProblem = "noLines" | "unknownLine" | "tooMany" | "nothingLeft";

/**
 * The parcel asked for, held to what is still to ship. No lines named means
 * everything left. Quantities of 0 are dropped; a line named twice is added up.
 */
export function parcelLines(
  order: Fulfillable,
  requested: { itemId: string; quantity: number }[] | null | undefined,
): { lines: { itemId: string; quantity: number }[] } | { problem: FulfillmentProblem; itemId?: string } {
  const remaining = new Map(unshippedLines(order).map((line) => [line.itemId, line.quantity]));
  if (remaining.size === 0) return { problem: "nothingLeft" };
  if (!requested || requested.length === 0) {
    return { lines: [...remaining].map(([itemId, quantity]) => ({ itemId, quantity })) };
  }
  const wanted = new Map<string, number>();
  for (const line of requested) {
    const quantity = Math.floor(Number(line.quantity));
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    if (!order.items.some((item) => item.id === line.itemId)) return { problem: "unknownLine", itemId: line.itemId };
    wanted.set(line.itemId, (wanted.get(line.itemId) ?? 0) + quantity);
  }
  if (wanted.size === 0) return { problem: "noLines" };
  for (const [itemId, quantity] of wanted) {
    if (quantity > (remaining.get(itemId) ?? 0)) return { problem: "tooMany", itemId };
  }
  return { lines: order.items.filter((item) => wanted.has(item.id)).map((item) => ({ itemId: item.id, quantity: wanted.get(item.id)! })) };
}

/** The address can change until the first parcel leaves, on an order that is still live. */
export function canEditAddress(order: Fulfillable & Pick<Order, "customer">): boolean {
  if (order.customer.anonymisedAt) return false;
  if (orderFulfillments(order).length > 0) return false;
  return order.status === "awaiting_payment" || order.status === "paid" || order.status === "in_production" || order.status === "exception";
}

export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 40;
export const MAX_NOTE_LENGTH = 2000;

/**
 * Tags as entered, comma-separated or as a list: trimmed, each once whatever
 * its case, empty ones dropped. Null when there are too many or one is too long.
 */
export function normalizeTags(input: string | string[]): string[] | null {
  const raw = Array.isArray(input) ? input : input.split(",");
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const entry of raw) {
    const tag = String(entry).trim().replace(/\s+/g, " ");
    if (!tag) continue;
    if (tag.length > MAX_TAG_LENGTH) return null;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags.length > MAX_TAGS ? null : tags;
}

/* ------------------------------------------------- abandoned checkouts */

export const RECOVERY_DELAYS = [1, 4, 10, 24] as const;
export const DEFAULT_RECOVERY: CheckoutRecoverySettings = { enabled: false, delayHours: 10 };

export function checkoutRecovery(store: Pick<Store, "checkoutRecovery">): CheckoutRecoverySettings {
  const saved = store.checkoutRecovery;
  if (!saved) return DEFAULT_RECOVERY;
  const delay = (RECOVERY_DELAYS as readonly number[]).includes(saved.delayHours) ? saved.delayHours : DEFAULT_RECOVERY.delayHours;
  return { enabled: Boolean(saved.enabled), delayHours: delay };
}

/** Recovery emails go out at most this long after the checkout expired, so an old basket is not chased. */
export const RECOVERY_WINDOW_DAYS = 7;

type Abandoned = Pick<Order, "abandonedAt" | "recovery" | "customer">;

/**
 * Whether this abandoned checkout should get its email now: the store has it
 * on, the shopper agreed to marketing email, none went before, and the delay
 * has passed but the window has not.
 */
export function recoveryDue(order: Abandoned, settings: CheckoutRecoverySettings, now: Date): boolean {
  if (!settings.enabled || !order.abandonedAt || order.recovery) return false;
  if (!order.customer.acceptsMarketing || order.customer.anonymisedAt || !order.customer.email) return false;
  const age = now.getTime() - new Date(order.abandonedAt).getTime();
  return age >= settings.delayHours * 3_600_000 && age <= RECOVERY_WINDOW_DAYS * 86_400_000;
}

export type AbandonedState = "recovered" | "emailed" | "notEmailed";

/**
 * Where an abandoned checkout stands: recovered when the same shopper paid for
 * an order in the store afterwards.
 */
export function abandonedState(order: Abandoned, paidAfter: (email: string, since: string) => boolean): AbandonedState {
  if (order.abandonedAt && paidAfter(order.customer.email.toLowerCase(), order.abandonedAt)) return "recovered";
  return order.recovery ? "emailed" : "notEmailed";
}

/**
 * The rules behind the order page's day-to-day operations: what has shipped and
 * what is left, which units a new parcel may hold, when the address can still
 * change, how tags are cleaned up, and when an abandoned checkout is emailed.
 *
 * Pure, so the order page, the operations and `npm run order-ops-check` all
 * read the same answers without a database.
 */
import { addressRegionKind, isCountryCode } from "./countries";
import type { CheckoutRecoverySettings, Order, OrderShipment } from "./types";

export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 40;
export const MAX_NOTE_LENGTH = 5000;

/**
 * Tags as typed, comma separated or as a list: trimmed, inner spaces collapsed,
 * each once whatever its case, in the order first given.
 */
export function normaliseTags(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : typeof input === "string" ? input.split(",") : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const tag = value.replace(/\s+/g, " ").trim().slice(0, MAX_TAG_LENGTH);
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
  }
  return out;
}

type ShipmentSource = Pick<Order, "items" | "status"> & { shipments?: OrderShipment[] };

/**
 * Units already handed to a carrier, per line. An order shipped before parcels
 * were recorded one by one has no shipments, and counts as shipped in full.
 */
export function shippedQuantities(order: ShipmentSource): Map<string, number> {
  const shipped = new Map<string, number>();
  if (!order.shipments?.length) {
    if (order.status === "shipped" || order.status === "delivered") {
      for (const item of order.items) shipped.set(item.id, item.quantity);
    }
    return shipped;
  }
  for (const shipment of order.shipments) {
    for (const line of shipment.lines) shipped.set(line.itemId, (shipped.get(line.itemId) ?? 0) + line.quantity);
  }
  return shipped;
}

/**
 * Units still to ship, per line, leaving out lines nothing is shipped for
 * (gift cards go out by email). Lines with nothing left are left out.
 */
export function remainingQuantities(order: ShipmentSource, notShipped: ReadonlySet<string> = new Set()): Map<string, number> {
  const shipped = shippedQuantities(order);
  const remaining = new Map<string, number>();
  for (const item of order.items) {
    if (notShipped.has(item.id)) continue;
    const left = item.quantity - (shipped.get(item.id) ?? 0);
    if (left > 0) remaining.set(item.id, left);
  }
  return remaining;
}

export type FulfilmentState = "unfulfilled" | "partial" | "fulfilled";

export function fulfilmentState(order: ShipmentSource, notShipped: ReadonlySet<string> = new Set()): FulfilmentState {
  const remaining = remainingQuantities(order, notShipped);
  if (remaining.size === 0) return "fulfilled";
  const shipped = shippedQuantities(order);
  return [...shipped.values()].some((quantity) => quantity > 0) ? "partial" : "unfulfilled";
}

/** A parcel can go out once the order is paid for, until it has all gone or the order is closed. */
export function canShip(order: Pick<Order, "status">): boolean {
  return order.status === "paid" || order.status === "in_production" || order.status === "exception" || order.status === "shipped";
}

export type ShipmentProblem = "nothingSelected" | "unknownLine" | "tooMany" | "nothingLeft";

export type ShipmentPlan =
  | { ok: true; lines: { itemId: string; quantity: number }[]; complete: boolean }
  | { ok: false; problem: ShipmentProblem; itemId?: string };

/**
 * The units a new parcel holds. `requested` null means everything still to
 * ship; otherwise each line asks for a whole number of units up to what is
 * left of it, and lines asking for none are dropped. `complete` is true when
 * nothing would be left to ship afterwards.
 */
export function planShipment(
  order: ShipmentSource,
  requested: { itemId: string; quantity: number }[] | null,
  notShipped: ReadonlySet<string> = new Set(),
): ShipmentPlan {
  const remaining = remainingQuantities(order, notShipped);
  if (remaining.size === 0) return { ok: false, problem: "nothingLeft" };
  if (requested === null) {
    return { ok: true, lines: [...remaining].map(([itemId, quantity]) => ({ itemId, quantity })), complete: true };
  }
  const wanted = new Map<string, number>();
  for (const line of requested) {
    if (!Number.isInteger(line.quantity) || line.quantity < 0) return { ok: false, problem: "tooMany", itemId: line.itemId };
    if (line.quantity === 0) continue;
    if (!order.items.some((item) => item.id === line.itemId) || notShipped.has(line.itemId)) {
      return { ok: false, problem: "unknownLine", itemId: line.itemId };
    }
    wanted.set(line.itemId, (wanted.get(line.itemId) ?? 0) + line.quantity);
  }
  if (wanted.size === 0) return { ok: false, problem: "nothingSelected" };
  for (const [itemId, quantity] of wanted) {
    if (quantity > (remaining.get(itemId) ?? 0)) return { ok: false, problem: "tooMany", itemId };
  }
  const complete = [...remaining].every(([itemId, left]) => (wanted.get(itemId) ?? 0) === left);
  // In the order's own line order, so the packing slip reads like the order.
  const lines = order.items.filter((item) => wanted.has(item.id)).map((item) => ({ itemId: item.id, quantity: wanted.get(item.id)! }));
  return { ok: true, lines, complete };
}

/** The address can change until the first parcel leaves, and never on a closed or anonymised order. */
export function canEditAddress(
  order: ShipmentSource & { customer: Pick<Order["customer"], "anonymisedAt"> },
): boolean {
  if (order.customer.anonymisedAt) return false;
  if (order.status === "shipped" || order.status === "delivered" || order.status === "cancelled") return false;
  return !(order.shipments?.length);
}

export interface AddressInput {
  name: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  phone: string;
}

export type AddressField = "name" | "line1" | "city" | "region" | "postalCode" | "country" | "phone";

/** The address cleaned up, or the first field that is not right, judged as checkout judges it. */
export function readAddress(input: Partial<Record<keyof AddressInput, unknown>>):
  | { ok: true; address: Omit<AddressInput, "line2" | "region" | "phone"> & { line2?: string; region?: string; phone?: string } }
  | { ok: false; field: AddressField } {
  const text = (key: keyof AddressInput) => String(input[key] ?? "").replace(/\s+/g, " ").trim();
  const country = text("country").toUpperCase();
  const name = text("name");
  const line1 = text("line1");
  const line2 = text("line2");
  const city = text("city");
  const postalCode = text("postalCode");
  const region = addressRegionKind(country) ? text("region") : "";
  const phone = text("phone");
  if (name.length < 2) return { ok: false, field: "name" };
  if (line1.length < 4) return { ok: false, field: "line1" };
  if (city.length < 2) return { ok: false, field: "city" };
  if (postalCode.length < 3) return { ok: false, field: "postalCode" };
  if (!isCountryCode(country)) return { ok: false, field: "country" };
  if (addressRegionKind(country) && region.length < 2) return { ok: false, field: "region" };
  if (phone && !/^\+?[\d\s().-]{6,20}$/.test(phone)) return { ok: false, field: "phone" };
  return {
    ok: true,
    address: {
      name,
      line1,
      ...(line2 ? { line2 } : {}),
      city,
      ...(region ? { region } : {}),
      postalCode,
      country,
      ...(phone ? { phone } : {}),
    },
  };
}

/* ------------------------------------------------------ abandoned checkouts */

export const RECOVERY_DELAY_DEFAULT = 10;
export const RECOVERY_DELAY_MIN = 1;
export const RECOVERY_DELAY_MAX = 72;
/** A checkout abandoned longer ago than this is not emailed any more. */
export const RECOVERY_WINDOW_DAYS = 7;

export function recoverySettings(store: { checkoutRecovery?: CheckoutRecoverySettings | null }): CheckoutRecoverySettings {
  return store.checkoutRecovery ?? { enabled: false, delayHours: RECOVERY_DELAY_DEFAULT, enabledAt: null };
}

type Abandoned = Pick<Order, "abandoned" | "marketingConsent" | "customer">;

export type RecoveryState = "recovered" | "sent" | "noConsent" | "scheduled" | "off" | "expired";

/** Where an abandoned checkout stands with its recovery email. */
export function recoveryState(order: Abandoned, settings: CheckoutRecoverySettings, now: Date): RecoveryState {
  const abandoned = order.abandoned;
  if (!abandoned) return "off";
  if (abandoned.recoveredAt) return "recovered";
  if (abandoned.recoveryEmailAt) return "sent";
  if (!order.marketingConsent || order.customer.anonymisedAt) return "noConsent";
  if (!settings.enabled || !settings.enabledAt || abandoned.at < settings.enabledAt) return "off";
  const age = now.getTime() - new Date(abandoned.at).getTime();
  if (age > RECOVERY_WINDOW_DAYS * 86_400_000) return "expired";
  return "scheduled";
}

/** True when the one recovery email for this checkout should go out now. */
export function recoveryDue(order: Abandoned, settings: CheckoutRecoverySettings, now: Date): boolean {
  if (recoveryState(order, settings, now) !== "scheduled") return false;
  return now.getTime() - new Date(order.abandoned!.at).getTime() >= settings.delayHours * 3_600_000;
}

/** The delay as entered, or null when it is not a whole number of hours in range. */
export function readDelayHours(value: unknown): number | null {
  const hours = Number(String(value ?? "").trim());
  if (!Number.isInteger(hours) || hours < RECOVERY_DELAY_MIN || hours > RECOVERY_DELAY_MAX) return null;
  return hours;
}

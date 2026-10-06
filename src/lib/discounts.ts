/**
 * Discount codes: what a code is worth, and whether it may be used at all.
 *
 * Kept free of request state and of the database so the basket, the checkout and
 * `placeOrder` all reach the same verdict from the same numbers — and so
 * `npm run discount-check` can exercise it directly. Nothing here trusts the
 * shopper: the code typed into the form is only ever a lookup key, and every
 * rule is re-checked against the stored record at payment time.
 */
import { convert } from "./pricing";
import type { DiscountCode, DiscountKind } from "./types";

/** The longest code a store can create, and what a shopper may type. */
export const MAX_DISCOUNT_CODE_LENGTH = 24;
export const MAX_DISCOUNT_PERCENTAGE = 90;

/** Upper-case, no spaces or punctuation — so "promo 10" and "PROMO-10" are one code. */
export function normalizeDiscountCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, MAX_DISCOUNT_CODE_LENGTH);
}

/** Why a code was turned down. Each maps to a line of shopper-facing copy. */
export type DiscountRefusal = "unknown" | "inactive" | "expired" | "limitReached" | "belowMinimum";

export interface DiscountVerdict {
  /** Null when the code may be used. */
  refusal: DiscountRefusal | null;
  /** What the code takes off the subtotal, in the basket currency. Zero when refused. */
  amount: number;
  /** The minimum basket the code needs, in the basket currency. */
  minimum: number;
}

/**
 * Decides a code against one basket. `subtotal` is the goods total in
 * `currency`, which is also what the result is stated in — a code written in the
 * store's own currency is converted like every other price.
 */
export function checkDiscount(
  code: DiscountCode,
  subtotal: number,
  currency: string,
  now: Date = new Date(),
): DiscountVerdict {
  const minimum = code.minimumSubtotal > 0 ? convert(code.minimumSubtotal, code.currency, currency) : 0;
  const refuse = (refusal: DiscountRefusal): DiscountVerdict => ({ refusal, amount: 0, minimum });

  if (!code.active) return refuse("inactive");
  if (isExpired(code, now)) return refuse("expired");
  if (code.usageLimit !== null && code.timesUsed >= code.usageLimit) return refuse("limitReached");
  if (subtotal < minimum) return refuse("belowMinimum");

  const amount = discountAmount(code, subtotal, currency);
  // A code that is worth nothing against this basket — a fixed amount in a
  // currency that rounds to zero, say — is not an applied discount.
  if (amount <= 0) return refuse("belowMinimum");
  return { refusal: null, amount, minimum };
}

/** Expiry is the end of the stored day, so a code dated today still works today. */
export function isExpired(code: Pick<DiscountCode, "expiresAt">, now: Date = new Date()): boolean {
  if (!code.expiresAt) return false;
  const end = new Date(`${code.expiresAt.slice(0, 10)}T23:59:59.999Z`).getTime();
  return Number.isFinite(end) ? now.getTime() > end : false;
}

/** What the code is worth against `subtotal`, never more than the goods themselves. */
export function discountAmount(
  code: Pick<DiscountCode, "kind" | "value" | "currency">,
  subtotal: number,
  currency: string,
): number {
  const raw =
    code.kind === "percentage"
      ? Math.round((subtotal * clampPercentage(code.value)) / 100)
      : convert(code.value, code.currency, currency);
  return Math.max(0, Math.min(subtotal, raw));
}

export function clampPercentage(value: number): number {
  return Math.min(MAX_DISCOUNT_PERCENTAGE, Math.max(1, Math.round(value)));
}

/**
 * Spreads a discount across the basket lines in proportion to their value, so
 * tax is charged on what the shopper actually pays rather than on the list
 * price. The running total is rounded rather than each share, so the shares add
 * back up to the discount exactly, with no stray penny.
 */
export function allocateDiscount(amounts: number[], discount: number): number[] {
  const subtotal = amounts.reduce((sum, amount) => sum + amount, 0);
  if (discount <= 0 || subtotal <= 0) return amounts.map(() => 0);
  let cumulative = 0;
  let allocated = 0;
  return amounts.map((amount) => {
    cumulative += amount;
    const share = Math.round((discount * cumulative) / subtotal) - allocated;
    allocated += share;
    return share;
  });
}

/** How a code reads in the workspace and on an order: "15% off" or "£10 off". */
export function discountKindLabel(kind: DiscountKind): string {
  return kind === "percentage" ? "Percentage" : "Fixed amount";
}

/**
 * Gift cards: codes, balances and how much of an order a card pays.
 *
 * Shared by checkout, the workspace, the Admin API and `npm run
 * gift-cards-check`. Kept free of server imports.
 */
import { convert } from "./pricing";
import type { GiftCard } from "./types";

/** The photo a gift card product is shown with until the store uploads its own. */
export const GIFT_CARD_IMAGE =
  "https://assets.clawcorp.ai/6a6d61c4c5a5e409b7afe7ad/gen/30c4b1faf44dc155cb622c44ea87f3f7-0.jpg";

export const GIFT_CARD_LIMITS = {
  /** In minor units of the card's currency. */
  minValue: 100,
  maxValue: 1_000_000,
  denominations: 8,
  note: 500,
} as const;

/**
 * The smallest amount a card payment may be. When a gift card would leave
 * less than this to pay, it pays a little less, so the rest can still be taken
 * by card.
 */
export const MINIMUM_CARD_CHARGE = 100;

/** No 0/O or 1/I, so a code read aloud or typed from a printout cannot be mistaken. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 16;

/** A new random code, `ABCD-EFGH-JKLM-NPQR`. */
export function generateGiftCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let raw = "";
  for (const byte of bytes) raw += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return groupCode(raw);
}

function groupCode(raw: string): string {
  return raw.match(/.{1,4}/g)?.join("-") ?? raw;
}

/** What a shopper typed, as it is stored: upper case, grouped in fours. Spaces and dashes are ignored. */
export function normalizeGiftCode(input: string): string {
  return groupCode(input.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 32));
}

export function looksLikeGiftCode(input: string): boolean {
  return /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/.test(normalizeGiftCode(input));
}

export function giftCodeLast4(code: string): string {
  return code.replace(/-/g, "").slice(-4);
}

/** The code as lists show it: only the last four characters. */
export function maskGiftCode(last4: string): string {
  return `•••• •••• •••• ${last4}`;
}

export type GiftCardRefusal = "unknown" | "disabled" | "expired" | "empty";

/** Why a card cannot pay right now, or null when it can. */
export function giftCardRefusal(
  card: Pick<GiftCard, "status" | "balance" | "expiresAt"> | null,
  now = new Date(),
): GiftCardRefusal | null {
  if (!card) return "unknown";
  if (card.status !== "active") return "disabled";
  if (card.expiresAt && new Date(card.expiresAt).getTime() < now.getTime()) return "expired";
  if (card.balance <= 0) return "empty";
  return null;
}

export interface GiftCardCover {
  /** Taken off the order, in the order's currency. */
  amount: number;
  /** Held on the card, in the card's currency. Never more than its balance. */
  cardAmount: number;
  /** True when the card pays the whole order and no card payment is needed. */
  coversAll: boolean;
}

/**
 * How much of an order of `total` (in `currency`) the card pays: the whole
 * order when the balance reaches and `canCoverAll`; otherwise up to the
 * balance and `partialLimit`, leaving at least the minimum card charge to pay.
 * On Stripe Checkout a gift card comes off the goods, not the delivery, so
 * the caller passes the goods' share of the total as the limit there.
 */
export function giftCardCover(
  card: Pick<GiftCard, "balance" | "currency">,
  total: number,
  currency: string,
  options: { canCoverAll?: boolean; partialLimit?: number; fx?: Record<string, number> } = {},
): GiftCardCover {
  const none = { amount: 0, cardAmount: 0, coversAll: false };
  if (total <= 0 || card.balance <= 0) return none;
  const available = convert(card.balance, card.currency, currency, options.fx);
  let amount: number;
  let coversAll = false;
  if (available >= total && (options.canCoverAll ?? true)) {
    amount = total;
    coversAll = true;
  } else {
    amount = Math.min(available, total - MINIMUM_CARD_CHARGE, options.partialLimit ?? total);
  }
  if (amount <= 0) return none;
  // Back into the card's currency, never above what it holds.
  const cardAmount = Math.min(card.balance, Math.max(1, convert(amount, currency, card.currency, options.fx)));
  return { amount, cardAmount, coversAll };
}

/** The denominations a store sells, cleaned: whole, in range, each once, lowest first. */
export function cleanDenominations(values: number[]): number[] {
  return [...new Set(values.filter((v) => Number.isInteger(v) && v >= GIFT_CARD_LIMITS.minValue && v <= GIFT_CARD_LIMITS.maxValue))]
    .sort((a, b) => a - b)
    .slice(0, GIFT_CARD_LIMITS.denominations);
}

/**
 * The cover a basket's gift card gives at checkout. Stripe Tax adds tax only
 * once the shopper is on Checkout, so there a card cannot settle the whole
 * order up front; and on Stripe Checkout it comes off the goods, not delivery.
 */
export function basketGiftCardCover(
  card: Pick<GiftCard, "balance" | "currency">,
  totals: { total: number; shipping: number; stripeTax: boolean },
  currency: string,
  payment: "stripe" | "demo",
  /** The store's exchange rates (`storeFxTable`); the built-in ones otherwise. */
  fx?: Record<string, number>,
): GiftCardCover {
  return giftCardCover(card, totals.total, currency, {
    canCoverAll: !totals.stripeTax,
    partialLimit: payment === "stripe" ? totals.total - totals.shipping : totals.total,
    fx,
  });
}

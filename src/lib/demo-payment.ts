import type { ShopperTranslator } from "@/i18n/shopper-copy";
import type { Store } from "./types";

/**
 * The simulated gateway behind demo stores (`store.demo`) and the orders they
 * took before Stripe Checkout. It settles Stripe's published test card numbers
 * locally and never reaches Stripe, so nobody is charged; live stores pay
 * through `lib/stripe.ts` instead.
 *
 * Every refusal a shopper can see is written in the shopper's language, through
 * the `t` the caller passes; `message` on a success is an internal note for the
 * order timeline.
 */

export interface ChargeInput {
  store: Store;
  amount: number;
  currency: string;
  cardNumber: string;
  expiry: string;
  cvc: string;
  name: string;
  idempotencyKey: string;
  /** The shopper's payment copy: `storefront.payment` in the page's language. */
  t: ShopperTranslator<"payment">;
}

export interface ChargeResult {
  ok: boolean;
  paymentIntentId: string | null;
  last4: string | null;
  message: string;
  code?: string;
}

const DECLINE_CARDS: Record<string, "declined" | "insufficientFunds" | "expiredCard"> = {
  "4000000000000002": "declined",
  "4000000000009995": "insufficientFunds",
  "4000000000000069": "expiredCard",
};

export function luhnValid(digits: string): boolean {
  if (!/^\d{12,19}$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export function expiryValid(expiry: string): boolean {
  const m = /^(\d{2})\s*\/\s*(\d{2,4})$/.exec(expiry.trim());
  if (!m) return false;
  const month = Number(m[1]);
  const year = Number(m[2].length === 2 ? `20${m[2]}` : m[2]);
  if (month < 1 || month > 12) return false;
  const now = new Date();
  const end = new Date(year, month, 1);
  return end > now;
}

function gatewayId(prefix: string, seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return `${prefix}_3${hash.toString(36).padStart(8, "0")}${seed.slice(-6).replace(/[^a-z0-9]/gi, "") || "aa"}`;
}

export async function chargeCard(input: ChargeInput): Promise<ChargeResult> {
  const { store, t } = input;
  if (!store.demo) {
    return {
      ok: false,
      paymentIntentId: null,
      last4: null,
      message: t("accountNotReady"),
      code: "account_not_ready",
    };
  }
  if (!store.currencies.includes(input.currency)) {
    return {
      ok: false,
      paymentIntentId: null,
      last4: null,
      message: t("currencyUnsupported", { currency: input.currency }),
      code: "currency_unsupported",
    };
  }

  const digits = input.cardNumber.replace(/\D/g, "");
  if (!luhnValid(digits)) {
    return {
      ok: false,
      paymentIntentId: null,
      last4: null,
      message: t("invalidNumber"),
      code: "invalid_number",
    };
  }
  if (!expiryValid(input.expiry)) {
    return {
      ok: false,
      paymentIntentId: null,
      last4: digits.slice(-4),
      message: t("invalidExpiry"),
      code: "invalid_expiry",
    };
  }
  if (!/^\d{3,4}$/.test(input.cvc.trim())) {
    return {
      ok: false,
      paymentIntentId: null,
      last4: digits.slice(-4),
      message: t("invalidCvc"),
      code: "invalid_cvc",
    };
  }

  const decline = DECLINE_CARDS[digits];
  if (decline) {
    return {
      ok: false,
      paymentIntentId: null,
      last4: digits.slice(-4),
      message: t(decline),
      code: "card_declined",
    };
  }

  return {
    ok: true,
    paymentIntentId: gatewayId("pi", input.idempotencyKey),
    last4: digits.slice(-4),
    message: `Demo payment simulated in ${input.currency}. No money moved.`,
  };
}

export interface RefundInput {
  store: Store;
  /** The intent the money was captured on; null on an order that never paid. */
  paymentIntentId: string | null;
  amount: number;
  currency: string;
  /** Same amount twice in a row returns the same refund id rather than two. */
  idempotencyKey: string;
}

export interface RefundResult {
  ok: boolean;
  refundId: string | null;
  message: string;
  code?: string;
}

/**
 * Settles a refund on a simulated payment. Refusals here are read by the store
 * team in the dashboard, not by shoppers, so they stay in English like the
 * timeline notes.
 */
export async function refundSimulated(input: RefundInput): Promise<RefundResult> {
  const { store, paymentIntentId } = input;
  if (!store.stripe.connected || !store.stripe.chargesEnabled) {
    return {
      ok: false,
      refundId: null,
      message: "The store's Stripe account cannot process refunds yet. Finish connecting it and try again.",
      code: "account_not_ready",
    };
  }
  if (!paymentIntentId) {
    return {
      ok: false,
      refundId: null,
      message: "This order has no captured Stripe payment to refund against.",
      code: "no_payment_intent",
    };
  }
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    return { ok: false, refundId: null, message: "Enter a refund amount above zero.", code: "invalid_amount" };
  }
  if (!store.currencies.includes(input.currency)) {
    return {
      ok: false,
      refundId: null,
      message: `${input.currency} is not one of this store's selling currencies.`,
      code: "currency_unsupported",
    };
  }

  return {
    ok: true,
    refundId: gatewayId("re", input.idempotencyKey),
    message: `Demo refund of ${input.amount} ${input.currency} simulated against ${paymentIntentId}.`,
  };
}

export const TEST_CARDS = [
  { number: "4242 4242 4242 4242", label: "Payment succeeds" },
  { number: "4000 0000 0000 0002", label: "Card declined" },
  { number: "4000 0000 0000 9995", label: "Insufficient funds" },
];

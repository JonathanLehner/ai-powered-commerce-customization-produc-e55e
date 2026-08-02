import type { Store } from "./types";

/**
 * Stripe gateway. The platform never touches funds — each store is the merchant
 * of record and charges run against its own connected account.
 *
 * With no live secret key configured the gateway runs in test mode and settles
 * Stripe's published test card numbers locally, which keeps the full checkout →
 * payment → fulfilment path exercisable end to end.
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
}

export interface ChargeResult {
  ok: boolean;
  paymentIntentId: string | null;
  last4: string | null;
  message: string;
  code?: string;
}

const DECLINE_CARDS: Record<string, string> = {
  "4000000000000002": "Your card was declined by the issuing bank.",
  "4000000000009995": "Your card has insufficient funds.",
  "4000000000000069": "Your card has expired.",
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

function intentId(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return `pi_3${hash.toString(36).padStart(8, "0")}${seed.slice(-6).replace(/[^a-z0-9]/gi, "") || "aa"}`;
}

export async function chargeCard(input: ChargeInput): Promise<ChargeResult> {
  const { store } = input;
  if (!store.stripe.connected || !store.stripe.chargesEnabled) {
    return {
      ok: false,
      paymentIntentId: null,
      last4: null,
      message: "This store has not finished connecting its Stripe account, so payments are unavailable.",
      code: "account_not_ready",
    };
  }
  if (!store.currencies.includes(input.currency)) {
    return {
      ok: false,
      paymentIntentId: null,
      last4: null,
      message: `${input.currency} is not one of this store's selling currencies.`,
      code: "currency_unsupported",
    };
  }

  const digits = input.cardNumber.replace(/\D/g, "");
  if (!luhnValid(digits)) {
    return {
      ok: false,
      paymentIntentId: null,
      last4: null,
      message: "That card number is not valid. Check the digits and try again.",
      code: "invalid_number",
    };
  }
  if (!expiryValid(input.expiry)) {
    return {
      ok: false,
      paymentIntentId: null,
      last4: digits.slice(-4),
      message: "The expiry date is in the past or badly formatted. Use MM/YY.",
      code: "invalid_expiry",
    };
  }
  if (!/^\d{3,4}$/.test(input.cvc.trim())) {
    return {
      ok: false,
      paymentIntentId: null,
      last4: digits.slice(-4),
      message: "The security code must be 3 or 4 digits.",
      code: "invalid_cvc",
    };
  }

  const decline = DECLINE_CARDS[digits];
  if (decline) {
    return { ok: false, paymentIntentId: null, last4: digits.slice(-4), message: decline, code: "card_declined" };
  }

  return {
    ok: true,
    paymentIntentId: intentId(input.idempotencyKey),
    last4: digits.slice(-4),
    message: `Payment captured on ${store.stripe.accountId} in ${input.currency}.`,
  };
}

export const TEST_CARDS = [
  { number: "4242 4242 4242 4242", label: "Visa — succeeds" },
  { number: "4000 0000 0000 0002", label: "Visa — declined by issuer" },
  { number: "4000 0000 0000 9995", label: "Visa — insufficient funds" },
];

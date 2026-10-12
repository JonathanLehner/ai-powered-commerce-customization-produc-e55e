import type { Store } from "./types";

/**
 * How a store takes payment, decided in one place for the storefront, the gift
 * portal and the workspace.
 *
 * - `stripe`: a Connect account that Stripe has cleared for charges. Shoppers
 *   pay on Stripe Checkout and the order is confirmed by the webhook.
 * - `demo`: a seeded demonstration store. Payment is simulated with test card
 *   numbers and nobody is charged.
 * - `unavailable`: anything else, including account ids typed in by hand
 *   before Connect onboarding existed.
 *
 * A demo store that finishes Connect onboarding switches to `stripe`.
 */
export type PaymentMode = "stripe" | "demo" | "unavailable";

export function paymentMode(store: Pick<Store, "stripe" | "demo" | "status">): PaymentMode {
  if (store.status !== "active") return "unavailable";
  if (store.stripe.express && store.stripe.accountId && store.stripe.chargesEnabled) return "stripe";
  if (store.demo) return "demo";
  return "unavailable";
}

/** Whether the workspace shows the store's payments as set up, whatever the store's status. */
export function paymentsReady(store: Pick<Store, "stripe" | "demo">): boolean {
  return paymentMode({ ...store, status: "active" }) !== "unavailable";
}

import type { Store } from "./types";

/**
 * How a store takes payment, decided in one place for the storefront, the gift
 * portal and the workspace.
 *
 * - `stripe`: a Connect account that Stripe has cleared for charges. Shoppers
 *   pay on Stripe Checkout and the order is confirmed by the webhook.
 * - `demo`: a seeded demonstration store, or any store in test mode. Payment is
 *   simulated with test card numbers and nobody is charged.
 * - `unavailable`: anything else, including account ids typed in by hand
 *   before Connect onboarding existed.
 *
 * A demo store that finishes Connect onboarding switches to `stripe`. Test mode
 * comes first: a store only takes real payments once it is turned off.
 */
export type PaymentMode = "stripe" | "demo" | "unavailable";

export function paymentMode(store: Pick<Store, "stripe" | "demo" | "status" | "testMode">): PaymentMode {
  if (store.status !== "active") return "unavailable";
  if (store.testMode) return "demo";
  if (store.stripe.express && store.stripe.accountId && store.stripe.chargesEnabled) return "stripe";
  if (store.demo) return "demo";
  return "unavailable";
}

/** Whether the store takes real payments, or demo ones on a seeded store, whatever the store's status. Test mode is not ready. */
export function paymentsReady(store: Pick<Store, "stripe" | "demo" | "testMode">): boolean {
  return !store.testMode && paymentMode({ ...store, status: "active" }) !== "unavailable";
}

/**
 * A live store whose checkout is closed: shoppers can browse and fill a basket
 * but cannot pay until Stripe is connected. Archived stores are offline anyway.
 */
export function notTakingOrders(store: Pick<Store, "stripe" | "demo" | "status" | "testMode">): boolean {
  return store.status === "active" && paymentMode(store) === "unavailable";
}

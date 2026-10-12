import type { Store } from "../types";

/**
 * Store settings as the API returns them. The Stripe account id and the full
 * carrier account numbers stay with the store's administrators in the
 * workspace.
 */

export function presentPayments(store: Store) {
  const { stripe } = store;
  return {
    connected: stripe.connected,
    onboardedWithStripeConnect: Boolean(stripe.express),
    country: stripe.country,
    chargesEnabled: stripe.chargesEnabled,
    payoutsEnabled: stripe.payoutsEnabled ?? null,
    detailsSubmitted: stripe.detailsSubmitted ?? null,
    connectedAt: stripe.connectedAt,
  };
}

export function presentCarriers(store: Store) {
  return store.carriers.map((c) => ({
    carrier: c.carrier,
    enabled: c.enabled,
    accountNumberEnding: c.accountNumber ? c.accountNumber.slice(-4) : null,
    services: c.services,
  }));
}

export function presentDomain(store: Store) {
  return { customDomain: store.customDomain, domainStatus: store.domainStatus };
}

export function presentDefaultTax(store: Store) {
  return { defaultTaxBracketId: store.defaultTaxBracketId, pricesIncludeTax: store.pricesIncludeTax };
}

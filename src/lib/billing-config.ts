/**
 * Whether self-serve plan billing can run: it needs Parcelith's own Stripe key.
 * Kept free of imports so the proxy and the check scripts can read it.
 *
 * Read on every call, never at module scope: on Workers the environment is
 * only populated once a request is in flight.
 */
export function billingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

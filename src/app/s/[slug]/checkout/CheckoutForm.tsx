"use client";

import { useMemo } from "react";
import { placeOrder } from "@/app/actions/shop";
import { ActionForm } from "@/components/forms";
import { TEST_CARDS } from "@/lib/stripe";

export function CheckoutForm({
  storeId,
  currencies,
  currency,
  stripeAccountId,
}: {
  storeId: string;
  currencies: string[];
  currency: string;
  stripeAccountId: string | null;
}) {
  // Generated once per page load so a double submit cannot create two orders.
  const idempotencyKey = useMemo(
    () => `idem_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
    [],
  );

  return (
    <ActionForm
      action={placeOrder}
      submitLabel="Pay and place order"
      pendingLabel="Taking payment…"
      hidden={{ storeId, idempotencyKey }}
      className="card p-5"
    >
      {(state) => (
        <>
          <h2 className="text-base font-semibold text-ink">Delivery details</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="name" className="field-label">
                Full name
              </label>
              <input
                id="name"
                name="name"
                autoComplete="name"
                required
                aria-invalid={state.field === "name" ? true : undefined}
                className={state.field === "name" ? "input input-error" : "input"}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="email" className="field-label">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                aria-invalid={state.field === "email" ? true : undefined}
                aria-describedby="email-hint"
                className={state.field === "email" ? "input input-error" : "input"}
              />
              <p id="email-hint" className="field-hint">
                Order confirmation and delivery updates are sent here.
              </p>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="line1" className="field-label">
                Street address
              </label>
              <input
                id="line1"
                name="line1"
                autoComplete="address-line1"
                required
                aria-invalid={state.field === "line1" ? true : undefined}
                className={state.field === "line1" ? "input input-error" : "input"}
              />
            </div>
            <div>
              <label htmlFor="city" className="field-label">
                Town or city
              </label>
              <input
                id="city"
                name="city"
                autoComplete="address-level2"
                required
                aria-invalid={state.field === "city" ? true : undefined}
                className={state.field === "city" ? "input input-error" : "input"}
              />
            </div>
            <div>
              <label htmlFor="postalCode" className="field-label">
                Postal code
              </label>
              <input
                id="postalCode"
                name="postalCode"
                autoComplete="postal-code"
                required
                aria-invalid={state.field === "postalCode" ? true : undefined}
                className={state.field === "postalCode" ? "input input-error" : "input"}
              />
            </div>
            <div>
              <label htmlFor="country" className="field-label">
                Country code
              </label>
              <input
                id="country"
                name="country"
                autoComplete="country"
                maxLength={2}
                placeholder="US"
                required
                aria-invalid={state.field === "country" ? true : undefined}
                aria-describedby="country-hint"
                className={state.field === "country" ? "input input-error" : "input"}
              />
              <p id="country-hint" className="field-hint">
                Two letters, e.g. US, GB, DE. Production is routed by destination.
              </p>
            </div>
            <div>
              <label htmlFor="currency" className="field-label">
                Pay in
              </label>
              <select
                id="currency"
                name="currency"
                defaultValue={currency}
                aria-invalid={state.field === "currency" ? true : undefined}
                className={state.field === "currency" ? "input input-error" : "input"}
              >
                {currencies.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <h2 className="mt-8 text-base font-semibold text-ink">Payment</h2>
          <p className="mt-1 text-sm text-muted">
            Charged through this store&rsquo;s own Stripe account{" "}
            {stripeAccountId ? <span className="font-mono text-xs">{stripeAccountId}</span> : null}. Card details
            are never stored by the store.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="cardNumber" className="field-label">
                Card number
              </label>
              <input
                id="cardNumber"
                name="cardNumber"
                inputMode="numeric"
                autoComplete="cc-number"
                placeholder="4242 4242 4242 4242"
                required
                aria-invalid={state.field === "cardNumber" ? true : undefined}
                className={state.field === "cardNumber" ? "input input-error" : "input"}
              />
            </div>
            <div>
              <label htmlFor="expiry" className="field-label">
                Expiry (MM/YY)
              </label>
              <input
                id="expiry"
                name="expiry"
                autoComplete="cc-exp"
                placeholder="04/29"
                required
                aria-invalid={state.field === "expiry" ? true : undefined}
                className={state.field === "expiry" ? "input input-error" : "input"}
              />
            </div>
            <div>
              <label htmlFor="cvc" className="field-label">
                Security code
              </label>
              <input
                id="cvc"
                name="cvc"
                inputMode="numeric"
                autoComplete="cc-csc"
                placeholder="123"
                required
                aria-invalid={state.field === "cvc" ? true : undefined}
                className={state.field === "cvc" ? "input input-error" : "input"}
              />
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-line bg-canvas p-3 text-xs text-muted">
            <p className="font-medium text-ink">Stripe test mode</p>
            <ul className="mt-1.5 space-y-1">
              {TEST_CARDS.map((card) => (
                <li key={card.number}>
                  <span className="font-mono">{card.number}</span> — {card.label}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </ActionForm>
  );
}

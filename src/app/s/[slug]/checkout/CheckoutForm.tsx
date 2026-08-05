"use client";

import { useMemo, useState } from "react";
import { placeOrder } from "@/app/actions/shop";
import { CountrySelect } from "@/components/CountrySelect";
import { ActionForm } from "@/components/forms";
import { Callout } from "@/components/ui";
import {
  isCountryCode,
  localCountryName,
  regionForCountry,
  suppliersOutsideRegion,
  type FulfillmentSource,
} from "@/lib/countries";
import { fmt, fmtAround, joinList, type StorefrontCopy } from "@/lib/i18n";
import { TEST_CARDS } from "@/lib/stripe";

/** Stripe's published test numbers, labelled in the storefront's language. */
const TEST_CARD_LABELS: Record<string, keyof StorefrontCopy["checkout"]> = {
  "4242 4242 4242 4242": "cardSucceeds",
  "4000 0000 0000 0002": "cardDeclined",
  "4000 0000 0000 9995": "cardInsufficient",
};

export function CheckoutForm({
  storeId,
  currencies,
  currency,
  stripeAccountId,
  defaultCountry,
  fulfillmentSources,
  localeTag,
  t,
}: {
  storeId: string;
  currencies: string[];
  currency: string;
  stripeAccountId: string | null;
  /** The store's Stripe account country — where most of its shoppers are. */
  defaultCountry: string;
  fulfillmentSources: FulfillmentSource[];
  /** BCP-47 tag country names are shown in. */
  localeTag: string;
  t: StorefrontCopy["checkout"];
}) {
  // Generated once per page load so a double submit cannot create two orders.
  const idempotencyKey = useMemo(
    () => `idem_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
    [],
  );
  const [country, setCountry] = useState(() =>
    isCountryCode(defaultCountry) ? defaultCountry.toUpperCase() : "US",
  );
  const unfulfilled = suppliersOutsideRegion(country, fulfillmentSources);
  const destination = localCountryName(country, localeTag);
  const [payBefore, payAfter] = fmtAround(t.paymentNote, "account");

  return (
    <ActionForm
      action={placeOrder}
      submitLabel={t.submit}
      pendingLabel={t.pending}
      hidden={{ storeId, idempotencyKey }}
      className="card p-5"
    >
      {(state) => (
        <>
          <h2 className="text-base font-semibold text-ink">{t.deliveryDetails}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="name" className="field-label">
                {t.fullName}
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
                {t.email}
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
                {t.emailHint}
              </p>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="line1" className="field-label">
                {t.street}
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
                {t.city}
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
                {t.postalCode}
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
                {t.country}
              </label>
              <CountrySelect
                id="country"
                name="country"
                value={country}
                onChange={setCountry}
                invalid={state.field === "country"}
                describedBy="country-hint"
                localeTag={localeTag}
                label={t.country}
                searchPlaceholder={t.countrySearchPlaceholder}
                noMatch={t.countryNoMatch}
              />
              <p id="country-hint" className="field-hint">
                {t.countryHint}
              </p>
            </div>
            <div>
              <label htmlFor="currency" className="field-label">
                {t.payIn}
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

            {unfulfilled.length > 0 ? (
              <div className="sm:col-span-2">
                <Callout tone="amber" title={fmt(t.manualRoutingTitle, { country: destination })}>
                  <ul className="space-y-1">
                    {unfulfilled.map((source) => (
                      <li key={source.supplierId}>
                        {fmt(t.manualRoutingLine, {
                          supplier: source.supplierName,
                          products: joinList(source.productNames, t.productJoin),
                          country: destination,
                          region: regionForCountry(country),
                        })}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2">{t.manualRoutingBody}</p>
                </Callout>
              </div>
            ) : null}
          </div>

          <h2 className="mt-8 text-base font-semibold text-ink">{t.paymentTitle}</h2>
          <p className="mt-1 text-sm text-muted">
            {payBefore}
            {stripeAccountId ? <span className="font-mono text-xs">{stripeAccountId}</span> : null}
            {payAfter}
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="cardNumber" className="field-label">
                {t.cardNumber}
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
                {t.expiry}
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
                {t.securityCode}
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
            <p className="font-medium text-ink">{t.testMode}</p>
            <ul className="mt-1.5 space-y-1">
              {TEST_CARDS.map((card) => (
                <li key={card.number}>
                  <span className="font-mono">{card.number}</span> —{" "}
                  {t[TEST_CARD_LABELS[card.number]] ?? card.label}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </ActionForm>
  );
}

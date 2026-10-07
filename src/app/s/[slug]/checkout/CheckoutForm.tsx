"use client";

import { useState } from "react";
import { CreditCardIcon, TruckIcon } from "lucide-react";
import { placeOrder } from "@/app/actions/shop";
import { CountrySelect } from "@/components/CountrySelect";
import { ActionForm } from "@/components/forms";
import { Callout } from "@/components/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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

/** The heading of one step in the single-column checkout. */
function StepHeading({ icon: Icon, children }: { icon: typeof TruckIcon; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
      <Icon aria-hidden className="size-4 text-accent-foreground" />
      {children}
    </h2>
  );
}

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
  const [idempotencyKey] = useState(() => `idem_${crypto.randomUUID()}`);
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
      submitClassName="btn-primary w-full sm:w-auto sm:min-w-56"
      hidden={{ storeId, idempotencyKey }}
      className="rounded-card border border-border bg-card p-5 sm:p-6"
      actionsClassName="mt-7 flex flex-wrap items-center gap-3 border-t border-line pt-6"
    >
      {(state) => (
        <>
          <StepHeading icon={TruckIcon}>{t.deliveryDetails}</StepHeading>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="name">{t.fullName}</Label>
              <Input
                id="name"
                name="name"
                autoComplete="name"
                required
                aria-invalid={state.field === "name" ? true : undefined}
                className="mt-1.5"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="email">{t.email}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                aria-invalid={state.field === "email" ? true : undefined}
                aria-describedby="email-hint"
                className="mt-1.5"
              />
              <p id="email-hint" className="field-hint">
                {t.emailHint}
              </p>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="line1">{t.street}</Label>
              <Input
                id="line1"
                name="line1"
                autoComplete="address-line1"
                required
                aria-invalid={state.field === "line1" ? true : undefined}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="city">{t.city}</Label>
              <Input
                id="city"
                name="city"
                autoComplete="address-level2"
                required
                aria-invalid={state.field === "city" ? true : undefined}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="postalCode">{t.postalCode}</Label>
              <Input
                id="postalCode"
                name="postalCode"
                autoComplete="postal-code"
                required
                aria-invalid={state.field === "postalCode" ? true : undefined}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="country">{t.country}</Label>
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
              <Label htmlFor="currency">{t.payIn}</Label>
              <Select
                id="currency"
                name="currency"
                defaultValue={currency}
                aria-invalid={state.field === "currency" ? true : undefined}
                className="mt-1.5"
              >
                {currencies.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
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

          <div className="mt-9 border-t border-line pt-7">
            <StepHeading icon={CreditCardIcon}>{t.paymentTitle}</StepHeading>
            <p className="mt-1.5 text-sm text-muted">
              {payBefore}
              {stripeAccountId ? <span className="font-mono text-xs">{stripeAccountId}</span> : null}
              {payAfter}
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="cardNumber">{t.cardNumber}</Label>
                <Input
                  id="cardNumber"
                  name="cardNumber"
                  inputMode="numeric"
                  autoComplete="cc-number"
                  placeholder="4242 4242 4242 4242"
                  required
                  aria-invalid={state.field === "cardNumber" ? true : undefined}
                  className="mt-1.5 tabular-nums"
                />
              </div>
              <div>
                <Label htmlFor="expiry">{t.expiry}</Label>
                <Input
                  id="expiry"
                  name="expiry"
                  autoComplete="cc-exp"
                  placeholder="04/29"
                  required
                  aria-invalid={state.field === "expiry" ? true : undefined}
                  className="mt-1.5 tabular-nums"
                />
              </div>
              <div>
                <Label htmlFor="cvc">{t.securityCode}</Label>
                <Input
                  id="cvc"
                  name="cvc"
                  inputMode="numeric"
                  autoComplete="cc-csc"
                  placeholder="123"
                  required
                  aria-invalid={state.field === "cvc" ? true : undefined}
                  className="mt-1.5 tabular-nums"
                />
              </div>
            </div>

            <div className="mt-5 rounded-lg border border-line bg-secondary p-3.5 text-xs text-muted">
              <p className="font-medium text-ink">{t.testMode}</p>
              <ul className="mt-2 space-y-1">
                {TEST_CARDS.map((card) => (
                  <li key={card.number}>
                    <span className="font-mono tabular-nums">{card.number}</span> —{" "}
                    {t[TEST_CARD_LABELS[card.number]] ?? card.label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </ActionForm>
  );
}

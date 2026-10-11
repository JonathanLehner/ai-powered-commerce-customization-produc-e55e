"use client";

import { LockIcon } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { placeOrder } from "@/app/actions/shop";
import { CountrySelect } from "@/components/CountrySelect";
import { ActionForm } from "@/components/forms";
import { Callout } from "@/components/ui";
import { Card } from "@/components/ui/card";
import {
  isCountryCode,
  localCountryName,
  suppliersOutsideRegion,
  type FulfillmentSource,
} from "@/lib/countries";
import { TEST_CARDS } from "@/lib/stripe";
import type { ShopperMessages } from "@/i18n/shopper-copy";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Stripe's published test numbers, labelled in the storefront's language. */
const TEST_CARD_LABELS: Record<string, keyof ShopperMessages["checkout"]> = {
  "4242 4242 4242 4242": "cardSucceeds",
  "4000 0000 0000 0002": "cardDeclined",
  "4000 0000 0000 9995": "cardInsufficient",
};

export function CheckoutForm({
  storeId,
  currencies,
  currency,
  defaultCountry,
  fulfillmentSources,
}: {
  storeId: string;
  currencies: string[];
  currency: string;
  /** The store's Stripe account country — where most of its shoppers are. */
  defaultCountry: string;
  fulfillmentSources: FulfillmentSource[];
}) {
  const t = useTranslations("storefront.checkout");
  const format = useFormatter();
  const localeTag = useLocale();
  // Generated once per page load so a double submit cannot create two orders.
  const [idempotencyKey] = useState(() => `idem_${crypto.randomUUID()}`);
  const [country, setCountry] = useState(() =>
    isCountryCode(defaultCountry) ? defaultCountry.toUpperCase() : "US",
  );
  const unfulfilled = suppliersOutsideRegion(country, fulfillmentSources);
  const destination = localCountryName(country, localeTag);

  return (
    <Card asChild className="block overflow-visible p-5">
    <ActionForm
      action={placeOrder}
      submitLabel={t("submit")}
      pendingLabel={t("pending")}
      submitSize="lg"
      submitClassName="w-full sm:w-auto"
      hidden={{ storeId, idempotencyKey }}
    >
      {(state) => (
        <>
          <h2 className="font-heading text-base font-semibold text-foreground">{t("deliveryDetails")}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="name">
                {t("fullName")}
              </Label>
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
              <Label htmlFor="email">
                {t("email")}
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                aria-invalid={state.field === "email" ? true : undefined}
                className="mt-1.5"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="line1">
                {t("street")}
              </Label>
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
              <Label htmlFor="city">
                {t("city")}
              </Label>
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
              <Label htmlFor="postalCode">
                {t("postalCode")}
              </Label>
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
              <Label htmlFor="country">
                {t("country")}
              </Label>
              <CountrySelect
                id="country"
                name="country"
                value={country}
                onChange={setCountry}
                invalid={state.field === "country"}
              />
            </div>
            <div>
              <Label htmlFor="currency">
                {t("payIn")}
              </Label>
              <Select name="currency" defaultValue={currency}>
                <SelectTrigger
                  id="currency"
                  className="mt-1.5 w-full"
                  aria-invalid={state.field === "currency" ? true : undefined}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {unfulfilled.length > 0 ? (
              <div className="sm:col-span-2">
                <Callout tone="amber" title={t("manualRoutingTitle", { country: destination })}>
                  {t("manualRoutingLine", {
                    products: format.list(unfulfilled.flatMap((source) => source.productNames)),
                  })}
                </Callout>
              </div>
            ) : null}
          </div>

          <div className="mt-8 flex items-center justify-between gap-3">
            <h2 className="font-heading text-base font-semibold text-foreground">{t("paymentTitle")}</h2>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <LockIcon aria-hidden className="size-3.5" />
              {t("paymentNote")}
            </p>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="cardNumber">
                {t("cardNumber")}
              </Label>
              <Input
                id="cardNumber"
                name="cardNumber"
                inputMode="numeric"
                autoComplete="cc-number"
                placeholder="4242 4242 4242 4242"
                required
                aria-invalid={state.field === "cardNumber" ? true : undefined}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="expiry">
                {t("expiry")}
              </Label>
              <Input
                id="expiry"
                name="expiry"
                autoComplete="cc-exp"
                placeholder="04/29"
                required
                aria-invalid={state.field === "expiry" ? true : undefined}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="cvc">
                {t("securityCode")}
              </Label>
              <Input
                id="cvc"
                name="cvc"
                inputMode="numeric"
                autoComplete="cc-csc"
                placeholder="123"
                required
                aria-invalid={state.field === "cvc" ? true : undefined}
                className="mt-1.5"
              />
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-border bg-muted p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">{t("testMode")}</p>
            <ul className="mt-1.5 space-y-1">
              {TEST_CARDS.map((card) => (
                <li key={card.number}>
                  <span className="font-mono">{card.number}</span> ·{" "}
                  {TEST_CARD_LABELS[card.number] ? t(TEST_CARD_LABELS[card.number]) : card.label}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </ActionForm>
    </Card>
  );
}

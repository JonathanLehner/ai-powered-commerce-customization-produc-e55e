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
  addressRegionKind,
  isCountryCode,
  localCountryName,
  suppliersOutsideRegion,
  type FulfillmentSource,
} from "@/lib/countries";
import { policyPath } from "@/lib/policies";
import { DemoCardFields } from "@/components/DemoCardFields";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const REGION_LABELS = {
  state: "regionState",
  province: "regionProvince",
  prefecture: "regionPrefecture",
} as const;

export function CheckoutForm({
  mode,
  storeId,
  currencies,
  currency,
  defaultCountry,
  fulfillmentSources,
  base,
}: {
  /** A live store sends the shopper on to Stripe Checkout; a demo store simulates payment here. */
  mode: "stripe" | "demo";
  storeId: string;
  currencies: string[];
  currency: string;
  /** The store's Stripe account country — where most of its shoppers are. */
  defaultCountry: string;
  fulfillmentSources: FulfillmentSource[];
  /** The storefront's address in the shopper's language, for the policy links. */
  base: string;
}) {
  const t = useTranslations("storefront.checkout");
  const policies = useTranslations("storefront.policies");
  const format = useFormatter();
  const localeTag = useLocale();
  // Generated once per page load so a double submit cannot create two orders.
  const [idempotencyKey] = useState(() => `idem_${crypto.randomUUID()}`);
  const [country, setCountry] = useState(() =>
    isCountryCode(defaultCountry) ? defaultCountry.toUpperCase() : "US",
  );
  const unfulfilled = suppliersOutsideRegion(country, fulfillmentSources);
  const destination = localCountryName(country, localeTag);
  const regionKind = addressRegionKind(country);

  return (
    <Card asChild className="block overflow-visible p-5">
    <ActionForm
      action={placeOrder}
      submitLabel={mode === "stripe" ? t("continueToPayment") : t("submit")}
      pendingLabel={mode === "stripe" ? t("redirecting") : t("pending")}
      submitSize="lg"
      submitClassName="w-full sm:w-auto"
      hidden={{ storeId, idempotencyKey }}
      footer={
        <p className="w-full text-xs text-muted-foreground">
          {policies.rich("agreement", {
            terms: (chunks) => <PolicyLink href={policyPath(base, "terms")}>{chunks}</PolicyLink>,
            refunds: (chunks) => <PolicyLink href={policyPath(base, "refunds")}>{chunks}</PolicyLink>,
          })}
        </p>
      }
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
            <div className="sm:col-span-2">
              <Label htmlFor="line2">
                {t("line2")}
              </Label>
              <Input
                id="line2"
                name="line2"
                autoComplete="address-line2"
                aria-invalid={state.field === "line2" ? true : undefined}
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
            {regionKind ? (
              <div>
                <Label htmlFor="region">
                  {t(REGION_LABELS[regionKind])}
                </Label>
                <Input
                  id="region"
                  name="region"
                  autoComplete="address-level1"
                  required
                  aria-invalid={state.field === "region" ? true : undefined}
                  className="mt-1.5"
                />
              </div>
            ) : null}
            <div>
              <Label htmlFor="phone">
                {t("phone")}
              </Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                aria-invalid={state.field === "phone" ? true : undefined}
                className="mt-1.5"
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
          {mode === "demo" ? <DemoCardFields field={state.field} /> : null}
        </>
      )}
    </ActionForm>
    </Card>
  );
}

/** Opens in a new tab so the details typed into the form are not lost. */
function PolicyLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener" className="text-foreground underline underline-offset-2 hover:no-underline">
      {children}
    </a>
  );
}

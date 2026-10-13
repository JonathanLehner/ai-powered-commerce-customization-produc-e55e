"use client";

import { useFormatter, useTranslations } from "next-intl";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { formatMinorUnits } from "@/i18n/format";
import { basketGiftCardCover } from "@/lib/gift-cards";
import { pickOption, quoteTotals, zoneFor, type Quote, type QuoteBasis, type ShippingOption } from "@/lib/shipping";
import { cn } from "@/lib/utils";

/**
 * What the checkout page hands the browser to price delivery for whichever
 * country and rate the shopper picks: the rates of each zone, already worked
 * out for this basket, and the basis the tax and total come from. The numbers
 * come from the same functions the order is charged with.
 */
export interface CheckoutQuote {
  currency: string;
  basis: QuoteBasis;
  /** Null when the store has no zones and ships everywhere at the standard rate. */
  zones: { countries: string[]; options: ShippingOption[] }[] | null;
  standard: ShippingOption | null;
}

interface Delivery {
  country: string;
  setCountry: (code: string) => void;
  rateId: string | null;
  setRateId: (id: string) => void;
  options: ShippingOption[];
  option: ShippingOption | null;
  quote: Quote;
  /** The countries the shopper can pick; null for every country. */
  countries: string[] | null;
  currency: string;
  stripeTax: boolean;
  inclusive: boolean;
}

const DeliveryContext = createContext<Delivery | null>(null);

export function useCheckoutDelivery(): Delivery {
  const value = useContext(DeliveryContext);
  if (!value) throw new Error("useCheckoutDelivery outside CheckoutDeliveryProvider");
  return value;
}

export function CheckoutDeliveryProvider({
  quote,
  defaultCountry,
  children,
}: {
  quote: CheckoutQuote;
  defaultCountry: string;
  children: ReactNode;
}) {
  const [country, setCountry] = useState(defaultCountry);
  const [rateId, setRateId] = useState<string | null>(null);
  const value = useMemo<Delivery>(() => {
    const options = quote.zones
      ? (zoneFor(quote.zones, country)?.options ?? [])
      : quote.standard
        ? [quote.standard]
        : [];
    const option = pickOption(options, rateId);
    return {
      country,
      setCountry,
      rateId,
      setRateId,
      options,
      option,
      quote: quoteTotals(quote.basis, country, option?.amount ?? 0),
      countries: quote.zones ? [...new Set(quote.zones.flatMap((zone) => zone.countries))] : null,
      currency: quote.currency,
      stripeTax: quote.basis.stripeTax,
      inclusive: quote.basis.inclusive,
    };
  }, [quote, country, rateId]);
  return <DeliveryContext.Provider value={value}>{children}</DeliveryContext.Provider>;
}

/** "3–5 business days", or nothing for a rate without an estimate. */
export function useDeliveryEstimate() {
  const t = useTranslations("storefront.checkout");
  return (option: Pick<ShippingOption, "minDays" | "maxDays">) =>
    option.maxDays <= 0
      ? ""
      : option.minDays === option.maxDays || option.minDays <= 0
        ? t("deliveryDaysExact", { days: option.maxDays })
        : t("deliveryDays", { min: option.minDays, max: option.maxDays });
}

/** Shipping, discount, tax and total rows of the order summary. */
export function SummaryTotals({
  discount,
  giftCard = null,
  payment = "stripe",
}: {
  discount: { code: string; amount: number } | null;
  /** The card on the basket and what it holds, in its own currency. */
  giftCard?: { last4: string; balance: number; currency: string } | null;
  payment?: "stripe" | "demo";
}) {
  const t = useTranslations("storefront");
  const format = useFormatter();
  const { quote, option, currency, stripeTax, inclusive } = useCheckoutDelivery();
  const money = (minor: number) => formatMinorUnits(format, minor, currency);
  const cover = giftCard
    ? basketGiftCardCover(giftCard, { total: quote.total, shipping: quote.shipping, stripeTax }, currency, payment)
    : null;
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between gap-3">
        <dt className="text-muted-foreground">
          {option?.name ? t("checkout.shippingWith", { rate: option.name }) : t("checkout.shipping")}
        </dt>
        <dd className="tabular-nums text-foreground">
          {option ? (option.amount === 0 ? t("checkout.free") : money(quote.shipping)) : "–"}
        </dd>
      </div>
      {discount ? (
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t("discount.row", { code: discount.code })}</dt>
          <dd className="tabular-nums text-emerald-700">− {money(discount.amount)}</dd>
        </div>
      ) : null}
      {stripeTax ? (
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t("checkout.tax")}</dt>
          <dd className="text-muted-foreground">{inclusive ? t("checkout.taxIncludedSuffix") : t("checkout.taxAtPayment")}</dd>
        </div>
      ) : quote.taxUnavailable ? (
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t("checkout.tax")}</dt>
          <dd className="text-foreground">–</dd>
        </div>
      ) : (
        quote.taxRows.map((row) => (
          <div key={row.rate} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">
              {t("checkout.taxRow", { rate: row.rate })} {inclusive ? t("checkout.taxIncludedSuffix") : ""}
            </dt>
            <dd className="tabular-nums text-foreground">{money(row.amount)}</dd>
          </div>
        ))
      )}
      <div className="flex justify-between gap-3 border-t border-border pt-2">
        <dt className="font-semibold text-foreground">{t("checkout.total")}</dt>
        <dd className="text-base font-semibold tabular-nums text-foreground">{money(quote.total)}</dd>
      </div>
      {giftCard && cover && cover.amount > 0 ? (
        <>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t("giftCard.row", { last4: giftCard.last4 })}</dt>
            <dd className="tabular-nums text-emerald-700">− {money(cover.amount)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="font-semibold text-foreground">{t("giftCard.toPay")}</dt>
            <dd className="text-base font-semibold tabular-nums text-foreground">{money(quote.total - cover.amount)}</dd>
          </div>
        </>
      ) : null}
    </dl>
  );
}

/** The rates on offer for the chosen country, as radio cards posting `shippingRate`. */
export function ShippingMethods({ invalid }: { invalid: boolean }) {
  const t = useTranslations("storefront.checkout");
  const format = useFormatter();
  const estimate = useDeliveryEstimate();
  const { options, option, setRateId, currency } = useCheckoutDelivery();

  if (options.length === 0) {
    return (
      <p className="mt-3 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-inksoft">{t("noShippingOptions")}</p>
    );
  }
  return (
    <fieldset className="mt-3" aria-invalid={invalid ? true : undefined}>
      <legend className="sr-only">{t("shippingMethod")}</legend>
      <div className="space-y-2">
        {options.map((choice) => {
          const id = `shipping-${choice.rateId}`;
          const detail = estimate(choice);
          return (
            <label
              key={choice.rateId}
              htmlFor={id}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg border border-border px-4 py-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5",
                invalid && "border-destructive",
              )}
            >
              <input
                id={id}
                type="radio"
                name="shippingRate"
                value={choice.rateId}
                checked={option?.rateId === choice.rateId}
                onChange={() => setRateId(choice.rateId)}
                className="accent-primary"
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-foreground">{choice.name || t("standardShipping")}</span>
                {detail ? <span className="block text-xs text-muted-foreground">{detail}</span> : null}
              </span>
              <span className="shrink-0 font-medium tabular-nums text-foreground">
                {choice.amount === 0 ? t("free") : formatMinorUnits(format, choice.amount, currency)}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

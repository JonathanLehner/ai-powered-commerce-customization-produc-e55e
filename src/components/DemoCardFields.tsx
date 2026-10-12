"use client";

import { useTranslations } from "next-intl";
import { Callout } from "@/components/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ShopperMessages } from "@/i18n/shopper-copy";
import { TEST_CARDS } from "@/lib/demo-payment";

/** Stripe's published test numbers, labelled in the storefront's language. */
const TEST_CARD_LABELS: Record<string, keyof ShopperMessages["checkout"]> = {
  "4242 4242 4242 4242": "cardSucceeds",
  "4000 0000 0000 0002": "cardDeclined",
  "4000 0000 0000 9995": "cardInsufficient",
};

/**
 * The card fields of a demo store's simulated checkout, under a label that
 * says nobody is charged. Live stores pay on Stripe Checkout instead.
 */
export function DemoCardFields({ field }: { field?: string }) {
  const t = useTranslations("storefront.checkout");
  return (
    <>
      <div className="mt-4">
        <Callout tone="amber" title={t("demoStore")}>
          {t("demoStoreBody")}
        </Callout>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="cardNumber">{t("cardNumber")}</Label>
          <Input
            id="cardNumber"
            name="cardNumber"
            inputMode="numeric"
            autoComplete="cc-number"
            placeholder="1234 1234 1234 1234"
            required
            aria-invalid={field === "cardNumber" ? true : undefined}
            className="mt-1.5"
          />
        </div>
        <div>
          <Label htmlFor="expiry">{t("expiry")}</Label>
          <Input
            id="expiry"
            name="expiry"
            autoComplete="cc-exp"
            placeholder={t("expiryPlaceholder")}
            required
            aria-invalid={field === "expiry" ? true : undefined}
            className="mt-1.5"
          />
        </div>
        <div>
          <Label htmlFor="cvc">{t("securityCode")}</Label>
          <Input
            id="cvc"
            name="cvc"
            inputMode="numeric"
            autoComplete="cc-csc"
            placeholder={t("cvcPlaceholder")}
            required
            aria-invalid={field === "cvc" ? true : undefined}
            className="mt-1.5"
          />
        </div>
      </div>
      <div className="mt-4 rounded-lg border border-border bg-muted p-3 text-xs text-muted-foreground">
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
  );
}

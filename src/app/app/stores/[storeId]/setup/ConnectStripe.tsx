"use client";

import { useLocale, useTranslations } from "next-intl";
import { connectStripe, disconnectStripe } from "@/app/actions/stores";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Callout, DataList } from "@/components/ui";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { countryName } from "@/i18n/display";
import type { Store } from "@/lib/types";
import { STRIPE_COUNTRIES } from "@/lib/util";

/** Charges and payouts on the store's Connect account, as Stripe last reported them. */
export function ConnectStatusList({ stripe }: { stripe: Store["stripe"] }) {
  const t = useTranslations("settings");
  const state = (on: boolean | undefined) => (
    <Badge tone={on ? "green" : "amber"}>{on ? t("stripeEnabled") : t("stripePendingState")}</Badge>
  );
  return (
    <DataList
      rows={[
        { label: t("stripeAccount"), value: <span className="font-mono text-xs">{stripe.accountId}</span> },
        { label: t("stripeCharges"), value: state(stripe.chargesEnabled) },
        { label: t("stripePayouts"), value: state(stripe.payoutsEnabled) },
      ]}
    />
  );
}

/**
 * Starts or continues Stripe Connect onboarding. Without an account it asks
 * for the country the account is created in; with one it reopens onboarding.
 */
export function ConnectStripeForm({ store, label }: { store: Store; label?: string }) {
  const t = useTranslations("settings");
  const locale = useLocale();
  const hasAccount = Boolean(store.stripe.express && store.stripe.accountId);
  return (
    <ActionForm
      action={connectStripe}
      submitLabel={label ?? (hasAccount ? t("stripeContinue") : t("stripeConnect"))}
      pendingLabel={t("stripeOpening")}
      hidden={{ storeId: store.id }}
    >
      {(state) =>
        hasAccount ? null : (
          <div className="grid max-w-xs content-start gap-1.5">
            <Label htmlFor="country">{t("accountCountry")}</Label>
            <Select name="country" defaultValue={store.stripe.country}>
              <SelectTrigger id="country" className="w-full" aria-invalid={state.field === "country" ? true : undefined}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STRIPE_COUNTRIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {countryName(locale, c.code, c.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )
      }
    </ActionForm>
  );
}

/** The guided setup step: status, onboarding and reconnecting. */
export function StripeStep({ store }: { store: Store }) {
  const t = useTranslations("settings");
  const express = Boolean(store.stripe.express && store.stripe.accountId);
  const ready = express && store.stripe.chargesEnabled && store.stripe.payoutsEnabled;

  return (
    <div className="space-y-4">
      {store.demo && !(express && store.stripe.chargesEnabled) ? (
        <Callout tone="neutral" title={t("demoStoreTitle")}>
          {t("demoStoreBody")}
        </Callout>
      ) : null}
      {!express && store.stripe.connected && !store.demo ? (
        <Callout tone="amber">{t("stripeReconnect")}</Callout>
      ) : null}

      {express ? (
        <>
          <div className="max-w-md">
            <ConnectStatusList stripe={store.stripe} />
          </div>
          {ready ? null : <p className="text-sm text-muted-foreground">{t("stripeIncomplete")}</p>}
          <ConnectStripeForm store={store} label={ready ? t("stripeUpdate") : undefined} />
        </>
      ) : (
        <ConnectStripeForm store={store} />
      )}

      {store.stripe.connected ? (
        <form action={disconnectStripe}>
          <input type="hidden" name="storeId" value={store.id} />
          <SubmitButton variant="destructive" size="sm" pendingLabel={t("disconnecting")}>
            {t("disconnect")}
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}

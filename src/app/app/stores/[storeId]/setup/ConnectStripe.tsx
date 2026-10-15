"use client";

import { useLocale, useTranslations } from "next-intl";
import { connectStripe, disconnectStripe, setTestMode } from "@/app/actions/stores";
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

/** Test payments: checkout takes test cards and nobody is charged, until it is turned off. */
export function TestModeCard({ store }: { store: Store }) {
  const t = useTranslations("settings");
  const on = Boolean(store.testMode);
  const live = Boolean(store.stripe.express && store.stripe.accountId && store.stripe.chargesEnabled);
  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-foreground">{t("testModeTitle")}</p>
        <Badge tone={on ? "amber" : "neutral"}>{on ? t("testModeOn") : t("testModeOff")}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">{t("testModeBody")}</p>
      {on && live ? <Callout tone="amber">{t("testModeBlocksLive")}</Callout> : null}
      <form action={setTestMode}>
        <input type="hidden" name="storeId" value={store.id} />
        <input type="hidden" name="enabled" value={on ? "off" : "on"} />
        <SubmitButton variant="outline" size="sm" pendingLabel={t("testModeSaving")}>
          {on ? t("testModeTurnOff") : t("testModeTurnOn")}
        </SubmitButton>
      </form>
    </div>
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

      <TestModeCard store={store} />

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

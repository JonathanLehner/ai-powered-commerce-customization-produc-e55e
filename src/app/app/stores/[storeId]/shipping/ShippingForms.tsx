"use client";

import { PlusIcon, XIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import {
  createShippingRate,
  createShippingZone,
  deleteShippingRate,
  deleteShippingZone,
  saveShippingRate,
  saveShippingZone,
  saveTaxSettingsForm,
} from "@/app/actions/shipping";
import { CountrySelect } from "@/components/CountrySelect";
import { ActionForm, ConfirmSubmit, Field, SubmissionKey } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { COUNTRIES, localCountryName, type FulfillmentRegion } from "@/lib/countries";
import { MAX_TIERS, RATE_KINDS } from "@/lib/shipping";
import type { ShippingRate, ShippingRateKind, ShippingZone, StoreTaxSettings } from "@/lib/types";
import { toMajorString } from "@/lib/util";

const REGIONS: FulfillmentRegion[] = [
  "European Union",
  "United Kingdom",
  "North America",
  "LATAM",
  "APAC",
  "Oceania",
  "Middle East",
  "Africa",
  "Rest of world",
];

/* ---------------------------------------------------------------- countries */

/**
 * The countries of a zone as removable chips, with a search to add one and a
 * button per region to add all of its countries at once. Countries another
 * zone already ships to are left out of a region.
 */
function CountriesField({
  initial,
  taken,
  invalid,
  prefix,
}: {
  initial: string[];
  /** Country code → the other zone it belongs to. */
  taken: Record<string, string>;
  invalid: boolean;
  prefix: string;
}) {
  const t = useTranslations("shipping");
  const regions = useTranslations("labels.region");
  const locale = useLocale();
  const [countries, setCountries] = useState<string[]>(initial);
  const add = (codes: string[]) =>
    setCountries((current) => [...new Set([...current, ...codes.filter((code) => !taken[code])])]);
  const sorted = [...countries].sort((a, b) => localCountryName(a, locale).localeCompare(localCountryName(b, locale), locale));

  return (
    <fieldset className="sm:col-span-2">
      <legend className="text-sm font-medium text-foreground">{t("countries")}</legend>
      {countries.map((code) => (
        <input key={code} type="hidden" name="countries" value={code} />
      ))}
      <div
        className={
          invalid
            ? "mt-1.5 flex min-h-11 flex-wrap gap-1.5 rounded-lg border border-destructive p-2"
            : "mt-1.5 flex min-h-11 flex-wrap gap-1.5 rounded-lg border border-border p-2"
        }
      >
        {sorted.length === 0 ? <span className="px-1 py-0.5 text-sm text-muted-foreground">{t("noCountries")}</span> : null}
        {sorted.map((code) => (
          <span
            key={code}
            className="inline-flex items-center gap-1 rounded-md bg-muted py-0.5 pr-1 pl-2 text-xs font-medium text-foreground"
          >
            {localCountryName(code, locale)}
            <button
              type="button"
              onClick={() => setCountries((current) => current.filter((c) => c !== code))}
              className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
              aria-label={t("removeCountry", { country: localCountryName(code, locale) })}
            >
              <XIcon className="size-3" aria-hidden />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,18rem)_1fr] sm:items-start">
        <div>
          <Label htmlFor={`${prefix}-add-country`} className="sr-only">
            {t("addCountry")}
          </Label>
          <CountrySelect id={`${prefix}-add-country`} name="countryPicker" value="" onChange={(code) => add([code])} />
          {Object.keys(taken).length > 0 ? (
            <p className="mt-1.5 text-xs text-muted-foreground">{t("takenHint")}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5 sm:pt-1.5">
          {REGIONS.map((region) => (
            <Button
              key={region}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => add(COUNTRIES.filter((c) => c.region === region).map((c) => c.code))}
            >
              <PlusIcon aria-hidden />
              {regions(region)}
            </Button>
          ))}
          {countries.length > 0 ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setCountries([])}>
              {t("clearCountries")}
            </Button>
          ) : null}
        </div>
      </div>
    </fieldset>
  );
}

/* -------------------------------------------------------------------- zones */

export function ZoneForm({
  storeId,
  zone,
  taken,
}: {
  storeId: string;
  /** Absent for a new zone. */
  zone?: ShippingZone;
  taken: Record<string, string>;
}) {
  const t = useTranslations("shipping");
  const prefix = zone ? `zone-${zone.id}` : "zone-new";
  return (
    <ActionForm
      action={zone ? saveShippingZone : createShippingZone}
      submitLabel={zone ? t("saveZone") : t("createZone")}
      pendingLabel={t("saving")}
      hidden={zone ? { storeId, zoneId: zone.id } : { storeId }}
    >
      {(state) => (
        <div className="grid gap-4 sm:grid-cols-2">
          {zone ? null : <SubmissionKey status={state.status} prefix="shz" />}
          <Field label={t("zoneName")} htmlFor={`${prefix}-name`} hint={t("zoneNameHint")}>
            <Input
              id={`${prefix}-name`}
              name="name"
              defaultValue={zone?.name ?? ""}
              maxLength={60}
              className="mt-1.5"
              aria-invalid={state.field === "name" ? true : undefined}
            />
          </Field>
          <CountriesField
            initial={zone?.countries ?? []}
            taken={taken}
            invalid={state.field === "countries"}
            prefix={prefix}
          />
        </div>
      )}
    </ActionForm>
  );
}

export function DeleteZone({ storeId, zoneId, name }: { storeId: string; zoneId: string; name: string }) {
  const t = useTranslations("shipping");
  return (
    <form action={deleteShippingZone}>
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="zoneId" value={zoneId} />
      <ConfirmSubmit
        variant="ghost"
        size="sm"
        confirmLabel={t("deleteZone")}
        question={t("deleteZoneQuestion", { name })}
        className="text-destructive"
      >
        {t("deleteZone")}
      </ConfirmSubmit>
    </form>
  );
}

/* -------------------------------------------------------------------- rates */

interface TierRow {
  upTo: string;
  amount: string;
}

function initialTiers(rate: ShippingRate | undefined, currency: string): TierRow[] {
  if (!rate || rate.tiers.length === 0) return [{ upTo: "", amount: "" }];
  return rate.tiers.map((tier) => ({
    upTo: tier.upTo === null ? "" : rate.kind === "weight" ? String(tier.upTo) : toMajorString(tier.upTo, currency),
    amount: toMajorString(tier.amount, currency),
  }));
}

export function RateForm({
  storeId,
  zone,
  rate,
}: {
  storeId: string;
  zone: ShippingZone;
  /** Absent for a new rate. */
  rate?: ShippingRate;
}) {
  const t = useTranslations("shipping");
  const [kind, setKind] = useState<ShippingRateKind>(rate?.kind ?? "flat");
  const [tiers, setTiers] = useState<TierRow[]>(() => initialTiers(rate, zone.currency));
  const prefix = rate ? `rate-${rate.id}` : `rate-new-${zone.id}`;
  const currency = zone.currency;
  const tiered = kind === "weight" || kind === "subtotal";

  return (
    <ActionForm
      action={rate ? saveShippingRate : createShippingRate}
      submitLabel={rate ? t("saveRate") : t("addRate")}
      pendingLabel={t("saving")}
      hidden={rate ? { storeId, zoneId: zone.id, rateId: rate.id } : { storeId, zoneId: zone.id }}
    >
      {(state) => (
        <div className="grid gap-4 sm:grid-cols-2">
          {rate ? null : <SubmissionKey status={state.status} prefix="shr" />}
          <Field label={t("rateName")} htmlFor={`${prefix}-name`} hint={t("rateNameHint")}>
            <Input
              id={`${prefix}-name`}
              name="name"
              defaultValue={rate?.name ?? ""}
              maxLength={60}
              className="mt-1.5"
              aria-invalid={state.field === "name" ? true : undefined}
            />
          </Field>
          <Field label={t("rateKind")} htmlFor={`${prefix}-kind`}>
            <Select name="kind" value={kind} onValueChange={(next) => setKind(next as ShippingRateKind)}>
              <SelectTrigger id={`${prefix}-kind`} className="mt-1.5 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RATE_KINDS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`kinds.${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {kind === "flat" || kind === "free_over" ? (
            <Field
              label={kind === "flat" ? t("price", { currency }) : t("priceBelow", { currency })}
              htmlFor={`${prefix}-amount`}
              hint={kind === "flat" ? t("priceHint") : undefined}
            >
              <Input
                id={`${prefix}-amount`}
                name="amount"
                inputMode="decimal"
                defaultValue={rate && (rate.kind === "flat" || rate.kind === "free_over") ? toMajorString(rate.amount, currency) : ""}
                className="mt-1.5 tabular-nums"
                aria-invalid={state.field === "amount" ? true : undefined}
              />
            </Field>
          ) : null}
          {kind === "free_over" ? (
            <Field label={t("threshold", { currency })} htmlFor={`${prefix}-threshold`} hint={t("thresholdHint")}>
              <Input
                id={`${prefix}-threshold`}
                name="threshold"
                inputMode="decimal"
                defaultValue={rate?.threshold != null ? toMajorString(rate.threshold, currency) : ""}
                className="mt-1.5 tabular-nums"
                aria-invalid={state.field === "threshold" ? true : undefined}
              />
            </Field>
          ) : null}

          {tiered ? (
            <fieldset className="sm:col-span-2">
              <legend className="text-sm font-medium text-foreground">
                {kind === "weight" ? t("weightTiers") : t("subtotalTiers")}
              </legend>
              <p className="mt-1 text-xs text-muted-foreground">{t("tiersHint")}</p>
              <input type="hidden" name="tiers" value={JSON.stringify(tiers)} />
              <div className="mt-2 space-y-2">
                {tiers.map((tier, index) => (
                  <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                    <div>
                      <Label htmlFor={`${prefix}-upto-${index}`} className="text-xs">
                        {kind === "weight" ? t("upToGrams") : t("upToAmount", { currency })}
                      </Label>
                      <Input
                        id={`${prefix}-upto-${index}`}
                        inputMode={kind === "weight" ? "numeric" : "decimal"}
                        value={tier.upTo}
                        placeholder={index === tiers.length - 1 ? t("andAbove") : ""}
                        onChange={(event) =>
                          setTiers((rows) => rows.map((row, i) => (i === index ? { ...row, upTo: event.target.value } : row)))
                        }
                        className="mt-1 tabular-nums"
                        aria-invalid={state.field === "tiers" ? true : undefined}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`${prefix}-tier-price-${index}`} className="text-xs">
                        {t("price", { currency })}
                      </Label>
                      <Input
                        id={`${prefix}-tier-price-${index}`}
                        inputMode="decimal"
                        value={tier.amount}
                        onChange={(event) =>
                          setTiers((rows) => rows.map((row, i) => (i === index ? { ...row, amount: event.target.value } : row)))
                        }
                        className="mt-1 tabular-nums"
                        aria-invalid={state.field === "tiers" ? true : undefined}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={tiers.length === 1}
                      onClick={() => setTiers((rows) => rows.filter((_, i) => i !== index))}
                      aria-label={t("removeTier", { row: index + 1 })}
                    >
                      <XIcon aria-hidden />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                disabled={tiers.length >= MAX_TIERS}
                onClick={() => setTiers((rows) => [...rows, { upTo: "", amount: "" }])}
              >
                <PlusIcon aria-hidden />
                {t("addTier")}
              </Button>
            </fieldset>
          ) : null}

          <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:max-w-sm">
            <Field label={t("minDays")} htmlFor={`${prefix}-minDays`}>
              <Input
                id={`${prefix}-minDays`}
                name="minDays"
                inputMode="numeric"
                defaultValue={rate ? String(rate.minDays) : ""}
                className="mt-1.5 tabular-nums"
                aria-invalid={state.field === "minDays" ? true : undefined}
              />
            </Field>
            <Field label={t("maxDays")} htmlFor={`${prefix}-maxDays`}>
              <Input
                id={`${prefix}-maxDays`}
                name="maxDays"
                inputMode="numeric"
                defaultValue={rate ? String(rate.maxDays) : ""}
                className="mt-1.5 tabular-nums"
                aria-invalid={state.field === "minDays" ? true : undefined}
              />
            </Field>
            <p className="col-span-2 -mt-1 text-xs text-muted-foreground">{t("daysHint")}</p>
          </div>
        </div>
      )}
    </ActionForm>
  );
}

export function DeleteRate({ storeId, zoneId, rate }: { storeId: string; zoneId: string; rate: ShippingRate }) {
  const t = useTranslations("shipping");
  return (
    <form action={deleteShippingRate}>
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="zoneId" value={zoneId} />
      <input type="hidden" name="rateId" value={rate.id} />
      <ConfirmSubmit
        variant="ghost"
        size="sm"
        confirmLabel={t("deleteRate")}
        question={t("deleteRateQuestion", { name: rate.name })}
        className="text-destructive"
      >
        {t("deleteRate")}
      </ConfirmSubmit>
    </form>
  );
}

/* ---------------------------------------------------------------------- tax */

interface TaxRow {
  key: number;
  country: string;
  rate: string;
}

export function TaxForm({
  storeId,
  settings,
  pricesIncludeTax,
  stripeConnected,
}: {
  storeId: string;
  settings: StoreTaxSettings;
  pricesIncludeTax: boolean;
  /** The store takes payments through its own Stripe account, which Stripe Tax needs. */
  stripeConnected: boolean;
}) {
  const t = useTranslations("shipping");
  const [mode, setMode] = useState(settings.mode);
  const [rows, setRows] = useState<TaxRow[]>(() =>
    settings.rates.map((row, index) => ({ key: index, country: row.country, rate: String(row.rate) })),
  );
  const nextKey = () => Math.max(-1, ...rows.map((row) => row.key)) + 1;

  return (
    <ActionForm action={saveTaxSettingsForm} submitLabel={t("saveTax")} pendingLabel={t("saving")} hidden={{ storeId }}>
      {(state) => (
        <div className="space-y-5">
          <fieldset>
            <legend className="text-sm font-medium text-foreground">{t("taxMode")}</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {(["manual", "stripe"] as const).map((option) => (
                <label
                  key={option}
                  className="flex cursor-pointer gap-3 rounded-xl border border-border p-4 has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
                >
                  <input
                    type="radio"
                    name="mode"
                    value={option}
                    checked={mode === option}
                    disabled={option === "stripe" && !stripeConnected}
                    onChange={() => setMode(option)}
                    className="mt-1 accent-primary"
                  />
                  <span>
                    <span className="block text-sm font-medium text-foreground">{t(`modes.${option}`)}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {option === "stripe" && !stripeConnected ? t("modes.stripeNeedsPayments") : t(`modes.${option}Hint`)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex items-start gap-2.5 text-sm text-inksoft">
            <Switch id="pricesIncludeTax" name="pricesIncludeTax" defaultChecked={pricesIncludeTax} className="mt-0.5" />
            <Label htmlFor="pricesIncludeTax" className="block cursor-pointer font-normal">
              <span className="block font-medium text-foreground">{t("pricesIncludeTax")}</span>
              <span className="block text-xs text-muted-foreground">{t("pricesIncludeTaxHint")}</span>
            </Label>
          </div>

          {mode === "manual" ? (
            <fieldset>
              <legend className="text-sm font-medium text-foreground">{t("countryRates")}</legend>
              <p className="mt-1 text-xs text-muted-foreground">{t("countryRatesHint")}</p>
              <div className="mt-3 space-y-2">
                {rows.map((row, index) => (
                  <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_7rem_auto] items-end gap-2 sm:max-w-xl">
                    <div>
                      <Label htmlFor={`tax-country-${row.key}`} className="text-xs">
                        {t("country")}
                      </Label>
                      <CountrySelect
                        id={`tax-country-${row.key}`}
                        name="taxCountry"
                        value={row.country}
                        onChange={(code) =>
                          setRows((current) => current.map((r, i) => (i === index ? { ...r, country: code } : r)))
                        }
                        invalid={state.field === "rates"}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`tax-rate-${row.key}`} className="text-xs">
                        {t("ratePercent")}
                      </Label>
                      <Input
                        id={`tax-rate-${row.key}`}
                        name="taxRate"
                        inputMode="decimal"
                        value={row.rate}
                        onChange={(event) =>
                          setRows((current) => current.map((r, i) => (i === index ? { ...r, rate: event.target.value } : r)))
                        }
                        className="mt-1.5 tabular-nums"
                        aria-invalid={state.field === "rates" ? true : undefined}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                      aria-label={t("removeTaxRow")}
                    >
                      <XIcon aria-hidden />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setRows((current) => [...current, { key: nextKey(), country: "", rate: "" }])}
              >
                <PlusIcon aria-hidden />
                {t("addTaxRow")}
              </Button>
            </fieldset>
          ) : (
            // The manual rates are kept while Stripe Tax is on, so switching back restores them.
            rows.map((row) => (
              <span key={row.key}>
                <input type="hidden" name="taxCountry" value={row.country} />
                <input type="hidden" name="taxRate" value={row.rate} />
              </span>
            ))
          )}
        </div>
      )}
    </ActionForm>
  );
}

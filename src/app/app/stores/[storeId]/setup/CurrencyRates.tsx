"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { refreshExchangeRates, saveCurrencyRates } from "@/app/actions/stores";
import { ActionForm } from "@/components/forms";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMinorUnits } from "@/i18n/format";
import {
  automaticRate,
  currencySettings,
  presentmentPrice,
  roundingRulesFor,
  type RateMode,
  type RoundingRule,
} from "@/lib/currency";
import type { Store } from "@/lib/types";
import { currencyDecimals } from "@/lib/util";

const TH = "px-3 text-xs font-semibold tracking-wide uppercase text-muted-foreground";

type Draft = { mode: RateMode; rate: string; rounding: RoundingRule };

/**
 * Exchange rate and rounding for each presentment currency, with the price a
 * 25.00 product would show at the rate and rule being entered.
 */
export function CurrencyRates({ store }: { store: Store }) {
  const t = useTranslations("settings.rates");
  const locale = useLocale();
  const format = useFormatter();
  const shop = store.defaultCurrency;
  const codes = store.currencies.filter((code) => code !== shop);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      codes.map((code) => {
        const saved = currencySettings(store, code);
        return [code, { mode: saved.mode, rate: saved.rate ? String(saved.rate) : "", rounding: saved.rounding }];
      }),
    ),
  );

  if (codes.length === 0) return <p className="text-sm text-muted-foreground">{t("none")}</p>;

  const sample = 25 * 10 ** currencyDecimals(shop);
  const rateText = (rate: number) => new Intl.NumberFormat(locale, { maximumSignificantDigits: 6 }).format(rate);

  function update(code: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [code]: { ...(prev[code] ?? { mode: "auto", rate: "", rounding: "none" }), ...patch } }));
  }

  function example(code: string): string {
    const draft = drafts[code];
    if (!draft) return "";
    const rate = Number(draft.rate.replace(",", "."));
    const preview = {
      ...store,
      currencyRates: {
        ...store.currencyRates,
        [code]: { mode: draft.mode, rate: draft.mode === "manual" && rate > 0 ? rate : null, rounding: draft.rounding },
      },
    };
    return formatMinorUnits(format, presentmentPrice(preview, sample, shop, code), code);
  }

  return (
    <div className="space-y-4">
      <ActionForm action={saveCurrencyRates} submitLabel={t("save")} hidden={{ storeId: store.id }}>
        {(state) => (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={TH}>{t("currency")}</TableHead>
                  <TableHead className={TH}>{t("rate")}</TableHead>
                  <TableHead className={TH}>{t("rounding")}</TableHead>
                  <TableHead className={TH}>{t("example", { price: formatMinorUnits(format, sample, shop) })}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {codes.map((code) => {
                  const draft = drafts[code];
                  const auto = automaticRate(store, code);
                  return (
                    <TableRow key={code}>
                      <TableCell className="px-3 font-medium">
                        <input type="hidden" name="rateCurrency" value={code} />
                        {code}
                      </TableCell>
                      <TableCell className="min-w-64 px-3">
                        <div className="flex items-center gap-2">
                          <input type="hidden" name={`mode_${code}`} value={draft.mode} />
                          <Select value={draft.mode} onValueChange={(mode) => update(code, { mode: mode as RateMode })}>
                            <SelectTrigger className="w-32" aria-label={t("modeLabel", { currency: code })}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="auto">{t("auto")}</SelectItem>
                              <SelectItem value="manual">{t("manual")}</SelectItem>
                            </SelectContent>
                          </Select>
                          {draft.mode === "manual" ? (
                            <Input
                              name={`rate_${code}`}
                              inputMode="decimal"
                              value={draft.rate}
                              onChange={(event) => update(code, { rate: event.currentTarget.value })}
                              placeholder={rateText(auto)}
                              className="w-28"
                              aria-label={t("rateLabel", { currency: code, shop })}
                              aria-invalid={state.field === `rate_${code}` ? true : undefined}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {t("rateValue", { shop, rate: rateText(auto), currency: code })}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-3">
                        <input type="hidden" name={`rounding_${code}`} value={draft.rounding} />
                        <Select value={draft.rounding} onValueChange={(rounding) => update(code, { rounding: rounding as RoundingRule })}>
                          <SelectTrigger className="w-40" aria-label={t("roundingLabel", { currency: code })}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {roundingRulesFor(code).map((rule) => (
                              <SelectItem key={rule} value={rule}>
                                {t(`rules.${rule.replace(".", "_") as "none"}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="px-3 font-medium tabular-nums">{example(code)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </ActionForm>
      <ActionForm
        action={refreshExchangeRates}
        submitLabel={t("refresh")}
        pendingLabel={t("refreshing")}
        submitVariant="outline"
        submitSize="sm"
        hidden={{ storeId: store.id }}
      >
        <p className="text-xs text-muted-foreground">
          {store.fxRates?.fetchedAt
            ? t("updated", { time: format.dateTime(new Date(store.fxRates.fetchedAt), { dateStyle: "medium", timeStyle: "short" }) })
            : t("notUpdated")}
        </p>
      </ActionForm>
    </div>
  );
}

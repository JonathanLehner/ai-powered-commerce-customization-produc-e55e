"use client";

import { useLocale, useTranslations } from "next-intl";
import { createStore } from "@/app/actions/stores";
import { ActionForm } from "@/components/forms";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { currencyName, languageOption } from "@/i18n/display";
import { LOCALES, LOCALE_NAMES } from "@/i18n/locales";
import { THEMES, type ThemeKey } from "@/lib/types";
import { CURRENCY_OPTIONS } from "@/lib/util";

export function NewStoreForm({
  agencyId,
  allowanceNote,
}: {
  agencyId: string;
  /** Where the agency stands against its plan's live-store limit. */
  allowanceNote?: string;
}) {
  const themeKeys = Object.keys(THEMES) as ThemeKey[];
  const t = useTranslations("newStore");
  const labels = useTranslations("labels");
  const locale = useLocale();

  return (
    <Card asChild>
    <ActionForm
      action={createStore}
      submitLabel={t("submit")}
      pendingLabel={t("pending")}
      hidden={{ agencyId }}
      actionsClassName="px-(--card-spacing)"
    >
      {(state) => (
        <CardContent>
          {allowanceNote ? <p className="text-sm text-muted-foreground">{allowanceNote}</p> : null}

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div className="grid content-start gap-1.5">
              <Label htmlFor="name">{t("storeName")}</Label>
              <Input
                id="name"
                name="name"
                required
                minLength={3}
                placeholder="Northwind Supply Co"
                aria-invalid={state.field === "name" ? true : undefined}
                              />
            </div>

            <div className="grid content-start gap-1.5">
              <Label htmlFor="clientName">{t("client")}</Label>
              <Input
                id="clientName"
                name="clientName"
                required
                placeholder="Northwind Technologies"
                aria-invalid={state.field === "clientName" ? true : undefined}
                              />
            </div>

            <div className="grid content-start gap-1.5">
              <Label htmlFor="defaultCurrency">{t("currency")}</Label>
              <Select name="defaultCurrency" defaultValue="USD">
                <SelectTrigger id="defaultCurrency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCY_OPTIONS.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code} · {currencyName(locale, c.code, c.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid content-start gap-1.5">
              <Label htmlFor="defaultLanguage">{t("language")}</Label>
              <Select name="defaultLanguage" defaultValue="en">
                <SelectTrigger id="defaultLanguage" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCALES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {languageOption(locale, code, LOCALE_NAMES[code])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <fieldset className="mt-6">
            <legend className="mb-3 text-sm leading-none font-medium text-foreground select-none">
              {t("theme")}
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {themeKeys.map((key, index) => (
                <Label
                  key={key}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3.5 font-normal hover:border-primary/40 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                >
                  <input
                    type="radio"
                    name="theme"
                    value={key}
                    defaultChecked={index === 0}
                    className="mt-1 size-4 accent-primary"
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="h-4 w-4 shrink-0 rounded border border-border"
                        style={{ background: THEMES[key].accent }}
                      />
                      <span className="text-sm font-semibold text-foreground">{THEMES[key].name}</span>
                    </span>
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      {labels(`theme.${key}`)}
                    </span>
                  </span>
                </Label>
              ))}
            </div>
          </fieldset>
        </CardContent>
      )}
    </ActionForm>
    </Card>
  );
}

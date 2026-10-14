"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import type { GalleryTemplate } from "@/components/TemplateGallery";
import type { TemplateStyle } from "@/lib/templates/model";
import { Checkbox } from "@/components/ui/checkbox";
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
  templates,
  categories,
}: {
  agencyId: string;
  /** Where the agency stands against its plan's live-store limit. */
  allowanceNote?: string;
  /** The templates a store can start from, as gallery cards. */
  templates: GalleryTemplate[];
  categories: { key: string; label: string }[];
}) {
  const themeKeys = Object.keys(THEMES) as ThemeKey[];
  const t = useTranslations("newStore");
  const tt = useTranslations("templates");
  const [templateId, setTemplateId] = useState("");
  const [category, setCategory] = useState(categories[0]?.key ?? "");
  const shown = templates.filter((tpl) => tpl.category === category);
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

          <fieldset className="mt-8">
            <legend className="text-sm leading-none font-medium text-foreground select-none">{t("templateStep")}</legend>
            <p className="mt-2 text-sm text-muted-foreground">{t("templateStepBody")}</p>
            <input type="hidden" name="templateId" value={templateId} />
            <div role="group" aria-label={tt("category")} className="mt-4 flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  aria-pressed={category === c.key}
                  onClick={() => setCategory(c.key)}
                  className={`h-8 rounded-full border px-3 text-xs font-medium ${category === c.key ? "border-foreground bg-foreground text-background" : "border-border text-foreground hover:border-foreground/40"}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <button
                type="button"
                aria-pressed={templateId === ""}
                onClick={() => setTemplateId("")}
                className={`flex aspect-[4/3] flex-col items-center justify-center rounded-xl border p-3 text-center text-sm ${templateId === "" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/40"}`}
              >
                <span className="font-semibold text-foreground">{t("blank")}</span>
                <span className="mt-1 text-xs text-muted-foreground">{t("blankBody")}</span>
              </button>
              {shown.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  aria-pressed={templateId === tpl.id}
                  onClick={() => setTemplateId(tpl.id)}
                  className={`overflow-hidden rounded-xl border text-left ${templateId === tpl.id ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/40"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={tpl.image} srcSet={tpl.imageSrcSet} sizes="240px" alt="" loading="lazy" className="aspect-[16/10] w-full object-cover object-top" />
                  <span className="block px-3 py-2">
                    <span className="block text-sm font-semibold text-foreground">{tpl.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{tpl.styles.map((s) => tt(`styles.${s as TemplateStyle}`)).join(" · ")}</span>
                  </span>
                </button>
              ))}
            </div>
            {templateId ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <Checkbox id="addStarterProducts" name="addStarterProducts" defaultChecked />
                  <Label htmlFor="addStarterProducts" className="leading-snug font-normal">
                    {t("addStarterProducts")}
                  </Label>
                </div>
                <a href={templates.find((tpl) => tpl.id === templateId)?.demoHref} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary hover:underline">
                  {tt("livePreview")}
                </a>
              </div>
            ) : null}
          </fieldset>

          <fieldset className="mt-6" hidden={templateId !== ""}>
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

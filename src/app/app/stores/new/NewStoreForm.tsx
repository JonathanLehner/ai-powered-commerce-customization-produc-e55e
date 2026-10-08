"use client";

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
import { LANGUAGE_OPTIONS } from "@/lib/i18n";
import { THEMES, type ThemeKey } from "@/lib/types";
import { CURRENCY_OPTIONS } from "@/lib/util";

export function NewStoreForm({
  agencyId,
  agencyName,
  allowanceNote,
}: {
  agencyId: string;
  agencyName: string;
  /** Where the agency stands against its plan's live-store limit. */
  allowanceNote?: string;
}) {
  const themeKeys = Object.keys(THEMES) as ThemeKey[];

  return (
    <Card asChild>
    <ActionForm
      action={createStore}
      submitLabel="Create store and continue to setup"
      pendingLabel="Creating store…"
      hidden={{ agencyId }}
      actionsClassName="px-(--card-spacing)"
    >
      {(state) => (
        <CardContent>
          <p className="text-sm text-muted-foreground">
            The store is created under <span className="font-medium text-foreground">{agencyName}</span>.
            Everything
            below can be changed later in store settings.
            {allowanceNote ? <span className="mt-1 block text-xs">{allowanceNote}</span> : null}
          </p>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div className="grid content-start gap-1.5">
              <Label htmlFor="name">Store name</Label>
              <Input
                id="name"
                name="name"
                required
                minLength={3}
                placeholder="Northwind Supply Co"
                aria-invalid={state.field === "name" ? true : undefined}
                aria-describedby="name-hint"
              />
              <p id="name-hint" className="text-xs text-muted-foreground">
                Shown in the workspace and on the storefront.
              </p>
            </div>

            <div className="grid content-start gap-1.5">
              <Label htmlFor="clientName">Client</Label>
              <Input
                id="clientName"
                name="clientName"
                required
                placeholder="Northwind Technologies"
                aria-invalid={state.field === "clientName" ? true : undefined}
                aria-describedby="clientName-hint"
              />
              <p id="clientName-hint" className="text-xs text-muted-foreground">
                The company this store belongs to.
              </p>
            </div>

            <div className="grid content-start gap-1.5">
              <Label htmlFor="defaultCurrency">Default selling currency</Label>
              <Select name="defaultCurrency" defaultValue="USD">
                <SelectTrigger id="defaultCurrency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCY_OPTIONS.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code} — {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">More currencies can be added during setup.</p>
            </div>

            <div className="grid content-start gap-1.5">
              <Label htmlFor="defaultLanguage">Default language</Label>
              <Select name="defaultLanguage" defaultValue="en">
                <SelectTrigger id="defaultLanguage" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGE_OPTIONS.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.label === l.endonym ? l.label : `${l.label} — ${l.endonym}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The storefront is written and formatted in this language, and its pages are marked with it.
              </p>
            </div>
          </div>

          <fieldset className="mt-6">
            <legend className="text-sm leading-none font-medium text-foreground select-none">
              Storefront theme
            </legend>
            <p className="mt-1.5 mb-3 text-xs text-muted-foreground">
              You can change this at any time and preview before publishing.
            </p>
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
                      {THEMES[key].description}
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

"use client";

import { createStore } from "@/app/actions/stores";
import { ActionForm } from "@/components/forms";
import { THEMES, type ThemeKey } from "@/lib/types";
import { CURRENCY_OPTIONS, LANGUAGE_OPTIONS } from "@/lib/util";

export function NewStoreForm({ agencyId, agencyName }: { agencyId: string; agencyName: string }) {
  const themeKeys = Object.keys(THEMES) as ThemeKey[];

  return (
    <ActionForm
      action={createStore}
      submitLabel="Create store and continue to setup"
      pendingLabel="Creating store…"
      hidden={{ agencyId }}
      className="card p-6"
    >
      {(state) => (
        <>
          <p className="text-sm text-muted">
            The store is created under <span className="font-medium text-ink">{agencyName}</span>. Everything
            below can be changed later in store settings.
          </p>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="name" className="field-label">
                Store name
              </label>
              <input
                id="name"
                name="name"
                required
                minLength={3}
                placeholder="Northwind Supply Co"
                aria-invalid={state.field === "name" ? true : undefined}
                aria-describedby="name-hint"
                className={state.field === "name" ? "input input-error" : "input"}
              />
              <p id="name-hint" className="field-hint">
                Shown in the workspace and on the storefront.
              </p>
            </div>

            <div>
              <label htmlFor="clientName" className="field-label">
                Client
              </label>
              <input
                id="clientName"
                name="clientName"
                required
                placeholder="Northwind Technologies"
                aria-invalid={state.field === "clientName" ? true : undefined}
                aria-describedby="clientName-hint"
                className={state.field === "clientName" ? "input input-error" : "input"}
              />
              <p id="clientName-hint" className="field-hint">
                The company this store belongs to.
              </p>
            </div>

            <div>
              <label htmlFor="defaultCurrency" className="field-label">
                Default selling currency
              </label>
              <select id="defaultCurrency" name="defaultCurrency" defaultValue="USD" className="input">
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.label}
                  </option>
                ))}
              </select>
              <p className="field-hint">More currencies can be added during setup.</p>
            </div>

            <div>
              <label htmlFor="defaultLanguage" className="field-label">
                Default language
              </label>
              <select id="defaultLanguage" name="defaultLanguage" defaultValue="en" className="input">
                {LANGUAGE_OPTIONS.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
              <p className="field-hint">Used for storefront copy and number formatting.</p>
            </div>
          </div>

          <fieldset className="mt-6">
            <legend className="field-label">Storefront theme</legend>
            <p className="field-hint mb-3">You can change this at any time and preview before publishing.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {themeKeys.map((key, index) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3.5 hover:border-brand-300 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50/50"
                >
                  <input
                    type="radio"
                    name="theme"
                    value={key}
                    defaultChecked={index === 0}
                    className="mt-1 h-4 w-4 accent-brand-600"
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="h-4 w-4 shrink-0 rounded border border-line"
                        style={{ background: THEMES[key].accent }}
                      />
                      <span className="text-sm font-semibold text-ink">{THEMES[key].name}</span>
                    </span>
                    <span className="mt-1 block text-xs text-muted">{THEMES[key].description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}
    </ActionForm>
  );
}

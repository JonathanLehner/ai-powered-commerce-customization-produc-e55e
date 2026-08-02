"use client";

import Image from "next/image";
import { useState } from "react";
import { flushSync } from "react-dom";
import {
  saveBranding,
  saveCarriers,
  saveDomain,
  saveLocalisation,
  saveStripe,
  saveTaxSettings,
  verifyDomain,
  disconnectStripe,
} from "@/app/actions/stores";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge } from "@/components/ui";
import { uploadImage } from "@/lib/upload-client";
import { THEMES, type Store, type StoredImage, type TaxBracket, type ThemeKey } from "@/lib/types";
import { CARRIER_LABELS, CURRENCY_OPTIONS, LANGUAGE_OPTIONS, STRIPE_COUNTRIES } from "@/lib/util";

function Step({
  index,
  title,
  description,
  done,
  children,
}: {
  index: number;
  title: string;
  description: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5" id={`step-${index}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            <span
              aria-hidden
              className={
                done
                  ? "flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700"
                  : "flex h-6 w-6 items-center justify-center rounded-full bg-canvas text-xs font-bold text-muted"
              }
            >
              {done ? "✓" : index}
            </span>
            {title}
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm text-muted">{description}</p>
        </div>
        <Badge tone={done ? "green" : "amber"}>{done ? "Complete" : "Needs attention"}</Badge>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

const LOGO_MAX_MB = 8;

/**
 * The logo file is stored through `/api/uploads` the moment it is chosen and
 * only its URL is submitted with the branding form. Posting the file itself
 * would exceed the 1 MB Server Action body limit and fail as a server error.
 */
function LogoField({ store, invalid }: { store: Store; invalid: boolean }) {
  const [uploaded, setUploaded] = useState<StoredImage | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = uploaded?.url ?? store.logoUrl;

  async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    const form = event.currentTarget.form;
    event.currentTarget.value = "";
    if (!file) return;

    setError(null);
    if (file.size > LOGO_MAX_MB * 1024 * 1024) {
      setError(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. Logos must be under ${LOGO_MAX_MB} MB.`);
      return;
    }

    setUploading(true);
    try {
      const stored = await uploadImage(file, "logo", { storeId: store.id });
      // The hidden fields have to be in the DOM before the form is submitted.
      flushSync(() => setUploaded(stored));
      form?.requestSubmit();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "That logo could not be uploaded.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-start gap-5">
      {uploaded ? <StoredImageFields prefix="logo" image={uploaded} /> : null}
      <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-canvas">
        {preview ? (
          <Image
            src={preview}
            alt={`${store.name} logo`}
            width={96}
            height={96}
            sizes="96px"
            className="h-full w-full object-contain p-2"
          />
        ) : (
          <span className="px-2 text-center text-xs text-muted">No logo yet</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <label htmlFor="logo" className="field-label">
          Client logo
        </label>
        <input
          id="logo"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          disabled={uploading}
          onChange={onChange}
          aria-invalid={invalid || error !== null ? true : undefined}
          aria-describedby="logo-hint"
          className={
            invalid || error
              ? "input input-error file:mr-3 file:rounded-md file:border-0 file:bg-canvas file:px-3 file:py-1.5 file:text-sm"
              : "input file:mr-3 file:rounded-md file:border-0 file:bg-canvas file:px-3 file:py-1.5 file:text-sm"
          }
        />
        <p id="logo-hint" className="field-hint">
          PNG, JPG, WEBP or SVG up to {LOGO_MAX_MB} MB. Uploads as soon as you choose a file.
        </p>
        <p role="status" aria-live="polite" className="mt-2 text-sm">
          {uploading ? <span className="text-muted">Uploading…</span> : null}
          {error ? <span className="text-rose-700">{error}</span> : null}
        </p>
      </div>
    </div>
  );
}

/** Mirrors `readStoredImage` on the server. */
function StoredImageFields({ prefix, image }: { prefix: string; image: StoredImage }) {
  const fields: [string, string][] = [
    ["Url", image.url],
    ["Name", image.fileName],
    ["Type", image.mimeType],
    ["Bytes", String(image.sizeBytes)],
    ["Width", String(image.pixelWidth)],
    ["Height", String(image.pixelHeight)],
    ["Alpha", image.hasAlpha ? "1" : "0"],
  ];
  return (
    <>
      {fields.map(([suffix, value]) => (
        <input key={suffix} type="hidden" name={`${prefix}${suffix}`} value={value} />
      ))}
    </>
  );
}

export function SetupSections({ store, brackets }: { store: Store; brackets: TaxBracket[] }) {
  const themeKeys = Object.keys(THEMES) as ThemeKey[];
  const [currencies, setCurrencies] = useState<string[]>(store.currencies);
  const [carrierEnabled, setCarrierEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(store.carriers.map((c) => [c.carrier, c.enabled])),
  );
  const hidden = { storeId: store.id };

  function toggleCurrency(code: string, on: boolean) {
    setCurrencies((prev) => (on ? [...new Set([...prev, code])] : prev.filter((c) => c !== code)));
  }

  return (
    <div className="space-y-5">
      <Step
        index={1}
        title="Branding"
        description="The client's logo appears in the storefront header and on order confirmations. The theme sets the storefront's colour and typography."
        done={store.setup.branding}
      >
        <ActionForm action={saveBranding} submitLabel="Save branding" hidden={hidden}>
          {(state) => (
            <>
              <LogoField store={store} invalid={state.field === "logo"} />

              <fieldset className="mt-6">
                <legend className="field-label">Storefront theme</legend>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {themeKeys.map((key) => (
                    <label
                      key={key}
                      className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3.5 hover:border-brand-300 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50/50"
                    >
                      <input
                        type="radio"
                        name="theme"
                        value={key}
                        defaultChecked={store.theme === key}
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
      </Step>

      <Step
        index={2}
        title="Language and selling currencies"
        description="Shoppers see prices in the currency they choose from this list. Amounts are formatted for each currency, so zero-decimal currencies such as JPY are handled correctly."
        done={store.setup.localisation}
      >
        <ActionForm action={saveLocalisation} submitLabel="Save localisation" hidden={hidden}>
          {(state) => (
            <>
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="defaultLanguage" className="field-label">
                    Default language
                  </label>
                  <select
                    id="defaultLanguage"
                    name="defaultLanguage"
                    defaultValue={store.defaultLanguage}
                    className="input"
                  >
                    {LANGUAGE_OPTIONS.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="defaultCurrency" className="field-label">
                    Default currency
                  </label>
                  <select
                    id="defaultCurrency"
                    name="defaultCurrency"
                    defaultValue={store.defaultCurrency}
                    aria-invalid={state.field === "defaultCurrency" ? true : undefined}
                    className={state.field === "defaultCurrency" ? "input input-error" : "input"}
                  >
                    {currencies.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                  <p className="field-hint">Must be one of the selling currencies below.</p>
                </div>
              </div>

              <fieldset className="mt-6">
                <legend className="field-label">Selling currencies</legend>
                <p className="field-hint mb-3">
                  {currencies.length} selected. Shoppers can switch between them on the storefront.
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {CURRENCY_OPTIONS.map((c) => (
                    <label
                      key={c.code}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-canvas has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50/60"
                    >
                      <input
                        type="checkbox"
                        name="currencies"
                        value={c.code}
                        defaultChecked={store.currencies.includes(c.code)}
                        onChange={(e) => toggleCurrency(c.code, e.currentTarget.checked)}
                        className="h-4 w-4 accent-brand-600"
                      />
                      <span className="font-medium text-ink">{c.code}</span>
                      <span className="truncate text-xs text-muted">{c.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          )}
        </ActionForm>
      </Step>

      <Step
        index={3}
        title="Custom domain"
        description="Point the client's own subdomain at this storefront. Until it is verified, the store is served from its Parcelith address."
        done={store.setup.domain}
      >
        <ActionForm action={saveDomain} submitLabel="Save domain" hidden={hidden}>
          {(state) => (
            <>
              <div className="max-w-md">
                <label htmlFor="customDomain" className="field-label">
                  Domain
                </label>
                <input
                  id="customDomain"
                  name="customDomain"
                  defaultValue={store.customDomain ?? ""}
                  placeholder="shop.yourclient.com"
                  aria-invalid={state.field === "customDomain" ? true : undefined}
                  aria-describedby="domain-hint"
                  className={state.field === "customDomain" ? "input input-error" : "input"}
                />
                <p id="domain-hint" className="field-hint">
                  Leave empty to serve the store from <span className="font-mono">/s/{store.slug}</span>.
                </p>
              </div>

              <div className="mt-4 rounded-lg border border-line bg-canvas p-4 text-sm">
                <p className="font-medium text-ink">DNS record to add</p>
                <p className="mt-1.5 font-mono text-xs text-inksoft">
                  CNAME {store.customDomain ?? "shop"} → stores.parcelith.net
                </p>
                <p className="mt-2 text-xs text-muted">
                  Current status:{" "}
                  <Badge tone={store.domainStatus === "verified" ? "green" : store.domainStatus === "pending" ? "amber" : "neutral"}>
                    {store.domainStatus === "verified"
                      ? "Verified"
                      : store.domainStatus === "pending"
                        ? "Awaiting verification"
                        : "No custom domain"}
                  </Badge>
                </p>
              </div>
            </>
          )}
        </ActionForm>
        <form action={verifyDomain} className="mt-3">
          <input type="hidden" name="storeId" value={store.id} />
          <input type="hidden" name="customDomain" value={store.customDomain ?? ""} />
          <input type="hidden" name="intent" value="verify" />
          <SubmitButton className="btn-secondary btn-sm" pendingLabel="Checking DNS…" disabled={!store.customDomain}>
            Run verification
          </SubmitButton>
        </form>
      </Step>

      <Step
        index={4}
        title="Stripe account"
        description="Payments settle directly into the client's own Stripe account — they are the merchant of record. Parcelith never holds the funds."
        done={store.setup.payments}
      >
        {store.stripe.connected ? (
          <div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
              <p className="font-medium text-emerald-900">
                Connected: <span className="font-mono">{store.stripe.accountId}</span>
              </p>
              <p className="mt-1 text-emerald-800">
                Country {store.stripe.country} · charges enabled · connected{" "}
                {store.stripe.connectedAt ? new Date(store.stripe.connectedAt).toLocaleDateString("en-US") : "—"}
              </p>
            </div>
            <form action={disconnectStripe} className="mt-4">
              <input type="hidden" name="storeId" value={store.id} />
              <input type="hidden" name="intent" value="disconnect" />
              <SubmitButton className="btn-danger btn-sm" pendingLabel="Disconnecting…">
                Disconnect Stripe
              </SubmitButton>
            </form>
          </div>
        ) : (
          <ActionForm action={saveStripe} submitLabel="Connect Stripe account" hidden={hidden}>
            {(state) => (
              <div className="grid max-w-2xl gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="accountId" className="field-label">
                    Stripe account ID
                  </label>
                  <input
                    id="accountId"
                    name="accountId"
                    placeholder="acct_1A2b3C4d5E6f"
                    aria-invalid={state.field === "accountId" ? true : undefined}
                    aria-describedby="accountId-hint"
                    className={state.field === "accountId" ? "input input-error" : "input"}
                  />
                  <p id="accountId-hint" className="field-hint">
                    Copy it from the client&rsquo;s Stripe dashboard under Settings → Account details.
                  </p>
                </div>
                <div>
                  <label htmlFor="country" className="field-label">
                    Account country
                  </label>
                  <select id="country" name="country" defaultValue={store.stripe.country} className="input">
                    {STRIPE_COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <p className="field-hint">Determines which currencies can be settled.</p>
                </div>
              </div>
            )}
          </ActionForm>
        )}
      </Step>

      <Step
        index={5}
        title="Shipping carriers"
        description="Enable the carriers the client has accounts with. Tracking links shown to shoppers use the carrier chosen for each shipment."
        done={store.setup.shipping}
      >
        <ActionForm action={saveCarriers} submitLabel="Save carriers" hidden={hidden}>
          {(state) => (
            <div className="grid gap-4 lg:grid-cols-3">
              {store.carriers.map((carrier) => (
                <div
                  key={carrier.carrier}
                  className="rounded-xl border border-line p-4 has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50/40"
                >
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      name={`${carrier.carrier}_enabled`}
                      defaultChecked={carrier.enabled}
                      onChange={(e) =>
                        setCarrierEnabled((prev) => ({ ...prev, [carrier.carrier]: e.currentTarget.checked }))
                      }
                      className="h-4 w-4 accent-brand-600"
                    />
                    <span className="text-sm font-semibold text-ink">{CARRIER_LABELS[carrier.carrier]}</span>
                  </label>
                  <div className="mt-3">
                    <label htmlFor={`${carrier.carrier}_account`} className="field-label text-xs">
                      Account number
                    </label>
                    <input
                      id={`${carrier.carrier}_account`}
                      name={`${carrier.carrier}_account`}
                      defaultValue={carrier.accountNumber}
                      placeholder="Required when enabled"
                      disabled={!carrierEnabled[carrier.carrier]}
                      aria-invalid={state.field === `${carrier.carrier}_account` ? true : undefined}
                      className={
                        state.field === `${carrier.carrier}_account`
                          ? "input input-error disabled:bg-canvas disabled:text-muted"
                          : "input disabled:bg-canvas disabled:text-muted"
                      }
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted">{carrier.services.join(" · ")}</p>
                </div>
              ))}
            </div>
          )}
        </ActionForm>
      </Step>

      <Step
        index={6}
        title="Tax configuration"
        description="Tax rates are set globally by the platform administrator. The store picks a default bracket, and each product can point at a different one."
        done={store.setup.tax}
      >
        <ActionForm action={saveTaxSettings} submitLabel="Save tax settings" hidden={hidden}>
          {(state) => (
            <>
              <div className="max-w-xl">
                <label htmlFor="defaultTaxBracketId" className="field-label">
                  Default tax bracket
                </label>
                <select
                  id="defaultTaxBracketId"
                  name="defaultTaxBracketId"
                  defaultValue={store.defaultTaxBracketId ?? ""}
                  aria-invalid={state.field === "defaultTaxBracketId" ? true : undefined}
                  className={state.field === "defaultTaxBracketId" ? "input input-error" : "input"}
                >
                  <option value="">Select a bracket…</option>
                  {brackets.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} — {b.rate}% ({b.code})
                    </option>
                  ))}
                </select>
              </div>
              <label className="mt-4 flex max-w-xl cursor-pointer items-start gap-3 rounded-lg border border-line p-3.5">
                <input
                  type="checkbox"
                  name="pricesIncludeTax"
                  defaultChecked={store.pricesIncludeTax}
                  className="mt-0.5 h-4 w-4 accent-brand-600"
                />
                <span>
                  <span className="block text-sm font-medium text-ink">Displayed prices include tax</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    Standard for UK and EU storefronts. Leave off to add tax at checkout, as is normal in the US.
                  </span>
                </span>
              </label>
              <div className="mt-5 relative overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[30rem] text-left text-sm">
                  <thead className="bg-canvas text-xs font-semibold uppercase tracking-wide text-muted">
                    <tr>
                      <th scope="col" className="px-3 py-2">Bracket</th>
                      <th scope="col" className="px-3 py-2">Rate</th>
                      <th scope="col" className="px-3 py-2">Applies to</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {brackets.map((b) => (
                      <tr key={b.id}>
                        <td className="px-3 py-2 font-medium text-ink">{b.name}</td>
                        <td className="px-3 py-2 tabular-nums text-inksoft">{b.rate}%</td>
                        <td className="px-3 py-2 text-muted">{b.regions.join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </ActionForm>
      </Step>
    </div>
  );
}

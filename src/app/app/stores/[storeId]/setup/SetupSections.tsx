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
  saveSupport,
  saveTaxSettings,
  verifyDomain,
  disconnectStripe,
} from "@/app/actions/stores";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge } from "@/components/ui";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LANGUAGE_OPTIONS } from "@/lib/i18n";
import { uploadImage } from "@/lib/upload-client";
import { THEMES, type Store, type StoredImage, type TaxBracket, type ThemeKey } from "@/lib/types";
import { CARRIER_LABELS, CURRENCY_OPTIONS, STRIPE_COUNTRIES } from "@/lib/util";

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
    <Card asChild>
      <section id={`step-${index}`}>
        <CardHeader>
          <CardTitle asChild>
            <h2 className="flex items-center gap-2">
              <span
                aria-hidden
                className={
                  done
                    ? "flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold tabular-nums text-emerald-700"
                    : "flex h-6 w-6 items-center justify-center rounded-full bg-canvas text-xs font-bold tabular-nums text-muted-foreground"
                }
              >
                {done ? "✓" : index}
              </span>
              {title}
            </h2>
          </CardTitle>
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
          <CardAction>
            <Badge tone={done ? "green" : "amber"}>{done ? "Complete" : "Needs attention"}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </section>
    </Card>
  );
}

const LOGO_MAX_MB = 8;

/** The column-head style every table in the workspace shares. */
const TH = "px-3 text-xs font-semibold tracking-wide uppercase text-muted-foreground";

/**
 * What the tax dropdown carries for "no bracket chosen". Radix refuses an empty
 * option value, so a hidden field posts it back as the blank the action reads.
 */
const NO_BRACKET = "none";

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
      <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-canvas">
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
          <span className="px-2 text-center text-xs text-muted-foreground">No logo yet</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <Label htmlFor="logo">Client logo</Label>
        <Input
          id="logo"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          disabled={uploading}
          onChange={onChange}
          aria-invalid={invalid || error !== null ? true : undefined}
          aria-describedby="logo-hint"
          className="mt-1.5 file:mr-3 file:rounded-md file:border-0 file:bg-canvas file:px-3 file:py-1.5 file:text-sm"
        />
        <p id="logo-hint" className="mt-1.5 text-xs text-muted-foreground">
          PNG, JPG, WEBP or SVG up to {LOGO_MAX_MB} MB. Uploads as soon as you choose a file.
        </p>
        <p role="status" aria-live="polite" className="mt-2 text-sm">
          {uploading ? <span className="text-muted-foreground">Uploading…</span> : null}
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
  const [bracket, setBracket] = useState(store.defaultTaxBracketId ?? NO_BRACKET);
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
                <legend className="text-sm leading-none font-medium text-foreground select-none">
                  Storefront theme
                </legend>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {themeKeys.map((key) => (
                    <Label
                      key={key}
                      className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3.5 font-normal hover:border-primary/40 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                    >
                      <input
                        type="radio"
                        name="theme"
                        value={key}
                        defaultChecked={store.theme === key}
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
            </>
          )}
        </ActionForm>
      </Step>

      <Step
        index={2}
        title="Language and selling currencies"
        description="The storefront is written in the default language and its amounts and dates follow that language's conventions. Shoppers see prices in the currency they choose from this list, so zero-decimal currencies such as JPY are handled correctly."
        done={store.setup.localisation}
      >
        <ActionForm action={saveLocalisation} submitLabel="Save localisation" hidden={hidden}>
          {(state) => (
            <>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="grid content-start gap-1.5">
                  <Label htmlFor="defaultLanguage">Default language</Label>
                  <Select name="defaultLanguage" defaultValue={store.defaultLanguage}>
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
                    Used for the storefront&rsquo;s own copy, its number and date formatting, and the language its
                    pages are marked with.
                  </p>
                </div>
                <div className="grid content-start gap-1.5">
                  <Label htmlFor="defaultCurrency">Default currency</Label>
                  <Select name="defaultCurrency" defaultValue={store.defaultCurrency}>
                    <SelectTrigger
                      id="defaultCurrency"
                      className="w-full"
                      aria-invalid={state.field === "defaultCurrency" ? true : undefined}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currencies.map((code) => (
                        <SelectItem key={code} value={code}>
                          {code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Must be one of the selling currencies below.</p>
                </div>
              </div>

              <fieldset className="mt-6">
                <legend className="text-sm leading-none font-medium text-foreground select-none">
                  Selling currencies
                </legend>
                <p className="mt-1.5 mb-3 text-xs text-muted-foreground">
                  <span className="tabular-nums">{currencies.length}</span> selected. Shoppers can switch
                  between them on the storefront.
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {CURRENCY_OPTIONS.map((c) => (
                    <Label
                      key={c.code}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-normal hover:bg-muted has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                    >
                      <Checkbox
                        name="currencies"
                        value={c.code}
                        defaultChecked={store.currencies.includes(c.code)}
                        onCheckedChange={(checked) => toggleCurrency(c.code, checked === true)}
                      />
                      <span className="font-medium text-foreground">{c.code}</span>
                      <span className="truncate text-xs font-normal text-muted-foreground">{c.label}</span>
                    </Label>
                  ))}
                </div>
              </fieldset>
            </>
          )}
        </ActionForm>
      </Step>

      <Step
        index={3}
        title="Shopper support contacts"
        description="Where a shopper with a problem reaches the client. The address is shown on the order status page and in the storefront footer, and is what the “Contact the store” button writes to — so it has to be one somebody reads."
        done={store.setup.support}
      >
        <ActionForm action={saveSupport} submitLabel="Save support contacts" hidden={hidden}>
          {(state) => (
            <div className="grid max-w-2xl gap-5 sm:grid-cols-2">
              <div className="grid content-start gap-1.5">
                <Label htmlFor="supportEmail">Support email address</Label>
                <Input
                  id="supportEmail"
                  name="supportEmail"
                  type="email"
                  defaultValue={store.supportEmail ?? ""}
                  placeholder="support@yourclient.com"
                  aria-invalid={state.field === "supportEmail" ? true : undefined}
                  aria-describedby="supportEmail-hint"
                />
                <p id="supportEmail-hint" className="text-xs text-muted-foreground">
                  Required. Shoppers write here about deliveries, personalisation and refunds.
                </p>
              </div>
              <div className="grid content-start gap-1.5">
                <Label htmlFor="supportPhone">
                  Support phone number <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="supportPhone"
                  name="supportPhone"
                  type="tel"
                  defaultValue={store.supportPhone ?? ""}
                  placeholder="+1 503 555 0142"
                  aria-invalid={state.field === "supportPhone" ? true : undefined}
                  aria-describedby="supportPhone-hint"
                />
                <p id="supportPhone-hint" className="text-xs text-muted-foreground">
                  Leave empty if the client does not answer a phone. Shown exactly as you type it.
                </p>
              </div>
            </div>
          )}
        </ActionForm>
      </Step>

      <Step
        index={4}
        title="Custom domain"
        description="Point the client's own subdomain at this storefront. Until it is verified, the store is served from its Parcelith address."
        done={store.setup.domain}
      >
        <ActionForm action={saveDomain} submitLabel="Save domain" hidden={hidden}>
          {(state) => (
            <>
              <div className="grid max-w-md gap-1.5">
                <Label htmlFor="customDomain">Domain</Label>
                <Input
                  id="customDomain"
                  name="customDomain"
                  defaultValue={store.customDomain ?? ""}
                  placeholder="shop.yourclient.com"
                  aria-invalid={state.field === "customDomain" ? true : undefined}
                  aria-describedby="domain-hint"
                />
                <p id="domain-hint" className="text-xs text-muted-foreground">
                  Leave empty to serve the store from <span className="font-mono">/s/{store.slug}</span>.
                </p>
              </div>

              <div className="mt-4 rounded-lg border border-border bg-canvas p-4 text-sm">
                <p className="font-medium text-foreground">DNS record to add</p>
                <p className="mt-1.5 font-mono text-xs text-inksoft">
                  CNAME {store.customDomain ?? "shop"} → stores.parcelith.net
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
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
        index={5}
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
                <div className="grid content-start gap-1.5">
                  <Label htmlFor="accountId">Stripe account ID</Label>
                  <Input
                    id="accountId"
                    name="accountId"
                    placeholder="acct_1A2b3C4d5E6f"
                    aria-invalid={state.field === "accountId" ? true : undefined}
                    aria-describedby="accountId-hint"
                  />
                  <p id="accountId-hint" className="text-xs text-muted-foreground">
                    Copy it from the client&rsquo;s Stripe dashboard under Settings → Account details.
                  </p>
                </div>
                <div className="grid content-start gap-1.5">
                  <Label htmlFor="country">Account country</Label>
                  <Select name="country" defaultValue={store.stripe.country}>
                    <SelectTrigger id="country" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STRIPE_COUNTRIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Determines which currencies can be settled.</p>
                </div>
              </div>
            )}
          </ActionForm>
        )}
      </Step>

      <Step
        index={6}
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
                  className="rounded-xl border border-border p-4 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                >
                  <div className="flex items-center gap-2.5">
                    <Switch
                      id={`${carrier.carrier}_enabled`}
                      name={`${carrier.carrier}_enabled`}
                      defaultChecked={carrier.enabled}
                      onCheckedChange={(enabled) =>
                        setCarrierEnabled((prev) => ({ ...prev, [carrier.carrier]: enabled }))
                      }
                    />
                    <Label htmlFor={`${carrier.carrier}_enabled`} className="cursor-pointer font-semibold">
                      {CARRIER_LABELS[carrier.carrier]}
                    </Label>
                  </div>
                  <div className="mt-3 grid gap-1.5">
                    <Label htmlFor={`${carrier.carrier}_account`} className="text-xs">
                      Account number
                    </Label>
                    <Input
                      id={`${carrier.carrier}_account`}
                      name={`${carrier.carrier}_account`}
                      defaultValue={carrier.accountNumber}
                      placeholder="Required when enabled"
                      disabled={!carrierEnabled[carrier.carrier]}
                      aria-invalid={state.field === `${carrier.carrier}_account` ? true : undefined}
                      className="disabled:bg-canvas disabled:text-muted-foreground"
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{carrier.services.join(" · ")}</p>
                </div>
              ))}
            </div>
          )}
        </ActionForm>
      </Step>

      <Step
        index={7}
        title="Tax configuration"
        description="Tax rates are set globally by the platform administrator. The store picks a default bracket, and each product can point at a different one."
        done={store.setup.tax}
      >
        <ActionForm action={saveTaxSettings} submitLabel="Save tax settings" hidden={hidden}>
          {(state) => (
            <>
              <div className="grid max-w-xl gap-1.5">
                <Label htmlFor="defaultTaxBracketId">Default tax bracket</Label>
                <input
                  type="hidden"
                  name="defaultTaxBracketId"
                  value={bracket === NO_BRACKET ? "" : bracket}
                />
                <Select value={bracket} onValueChange={setBracket}>
                  <SelectTrigger
                    id="defaultTaxBracketId"
                    className="w-full"
                    aria-invalid={state.field === "defaultTaxBracketId" ? true : undefined}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_BRACKET}>Select a bracket…</SelectItem>
                    {brackets.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} — {b.rate}% ({b.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="mt-4 flex max-w-xl items-start gap-3 rounded-lg border border-border p-3.5">
                <Switch
                  id="pricesIncludeTax"
                  name="pricesIncludeTax"
                  defaultChecked={store.pricesIncludeTax}
                  className="mt-0.5"
                />
                <Label htmlFor="pricesIncludeTax" className="block cursor-pointer font-normal">
                  <span className="block text-sm font-medium text-foreground">
                    Displayed prices include tax
                  </span>
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    Standard for UK and EU storefronts. Leave off to add tax at checkout, as is normal in the
                    US.
                  </span>
                </Label>
              </div>
              <div className="relative mt-5 overflow-x-auto rounded-xl border border-border">
                <Table className="min-w-[30rem]">
                  <TableHeader className="bg-canvas">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className={TH}>Bracket</TableHead>
                      <TableHead className={TH}>Rate</TableHead>
                      <TableHead className={TH}>Applies to</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {brackets.map((b) => (
                      <TableRow key={b.id} className="hover:bg-transparent">
                        <TableCell className="px-3 py-2 font-medium text-foreground">{b.name}</TableCell>
                        <TableCell className="px-3 py-2 tabular-nums text-inksoft">{b.rate}%</TableCell>
                        <TableCell className="px-3 py-2 whitespace-normal text-muted-foreground">
                          {b.regions.join(", ")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </ActionForm>
      </Step>
    </div>
  );
}

"use client";

import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { flushSync } from "react-dom";
import {
  saveBranding,
  saveCarriers,
  saveLanguages,
  saveLocalisation,
  savePolicies,
  saveSupport,
  saveTaxSettings,
} from "@/app/actions/stores";
import { ActionForm } from "@/components/forms";
import type { GalleryTemplate } from "@/components/TemplateGallery";
import { Badge } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { currencyName, languageOption } from "@/i18n/display";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/i18n/locales";
import { storeLanguages } from "@/i18n/storefront-routing";
import { POLICY_KEYS, POLICY_MAX_LENGTH, storePolicyText, type PolicyKey } from "@/lib/policies";
import { storeUrl } from "@/lib/seo";
import { uploadImage } from "@/lib/upload-client";
import type { SetupStatus } from "@/lib/metrics";
import { SETUP_STEPS, type SetupStep, type Store, type StoredImage, type TaxBracket } from "@/lib/types";
import { CARRIER_LABELS, CURRENCY_OPTIONS } from "@/lib/util";
import { StripeStep } from "./ConnectStripe";
import { CurrencyRates } from "./CurrencyRates";

function Step({
  step,
  title,
  description,
  status,
  children,
}: {
  step: SetupStep;
  title: string;
  description: string;
  status: SetupStatus;
  children: React.ReactNode;
}) {
  const t = useTranslations("settings");
  // Numbered from the same list the progress bar counts.
  const index = SETUP_STEPS.indexOf(step) + 1;
  const done = status[step];
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
            <Badge tone={done ? "green" : "amber"}>{done ? t("stepComplete") : t("stepAttention")}</Badge>
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
  const t = useTranslations("settings");

  async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    const form = event.currentTarget.form;
    event.currentTarget.value = "";
    if (!file) return;

    setError(null);
    if (file.size > LOGO_MAX_MB * 1024 * 1024) {
      setError(t("logoTooLarge", { size: (file.size / 1024 / 1024).toFixed(1), max: LOGO_MAX_MB }));
      return;
    }

    setUploading(true);
    try {
      const stored = await uploadImage(file, "logo", { storeId: store.id });
      // The hidden fields have to be in the DOM before the form is submitted.
      flushSync(() => setUploaded(stored));
      form?.requestSubmit();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : t("logoFailed"));
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
            alt={t("logoAlt", { name: store.name })}
            width={96}
            height={96}
            sizes="96px"
            className="h-full w-full object-contain p-2"
          />
        ) : (
          <span className="px-2 text-center text-xs text-muted-foreground">{t("noLogo")}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <Label htmlFor="logo">{t("clientLogo")}</Label>
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
          {t("logoHint", { max: LOGO_MAX_MB })}
        </p>
        <p role="status" aria-live="polite" className="mt-2 text-sm">
          {uploading ? <span className="text-muted-foreground">{t("uploading")}</span> : null}
          {error ? <span className="text-rose-700">{error}</span> : null}
        </p>
      </div>
    </div>
  );
}

/** The template the storefront is built from, with a way to change it in the storefront editor. */
function TemplateField({ storeId, template, canChange }: { storeId: string; template: GalleryTemplate | null; canChange: boolean }) {
  const t = useTranslations("settings");
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border p-3.5">
      {template ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={template.image}
          srcSet={template.imageSrcSet}
          sizes="128px"
          alt=""
          width={128}
          height={96}
          loading="lazy"
          className="aspect-[4/3] w-32 shrink-0 rounded-md border border-border object-cover object-top"
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{t("storefrontTemplate")}</p>
        <p className="mt-0.5 text-sm font-semibold text-foreground">{template ? template.name : t("noTemplate")}</p>
        {template ? <p className="mt-0.5 text-xs text-muted-foreground">{template.description}</p> : null}
      </div>
      {canChange ? (
        <Link
          href={`/app/stores/${storeId}/storefront?templates=1`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {template ? t("changeTemplate") : t("chooseTemplate")}
        </Link>
      ) : null}
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

export function SetupSections({
  store,
  status,
  brackets,
  policyDefaults,
  template,
  canEditStorefront,
}: {
  store: Store;
  status: SetupStatus;
  brackets: TaxBracket[];
  /** The built-in policy text per store language. */
  policyDefaults: Record<string, Record<PolicyKey, string>>;
  /** The template the storefront is built from, if any. */
  template: GalleryTemplate | null;
  canEditStorefront: boolean;
}) {
  const [languages, setLanguages] = useState<string[]>(() => storeLanguages(store).locales);
  const [defaultLanguage, setDefaultLanguage] = useState<string>(() => storeLanguages(store).defaultLocale);
  const [currencies, setCurrencies] = useState<string[]>(store.currencies);
  const [carrierEnabled, setCarrierEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(store.carriers.map((c) => [c.carrier, c.enabled])),
  );
  const [bracket, setBracket] = useState(store.defaultTaxBracketId ?? NO_BRACKET);
  const [policyLanguage, setPolicyLanguage] = useState<string>(() => storeLanguages(store).defaultLocale);
  const hidden = { storeId: store.id };
  const t = useTranslations("settings");
  const labels = useTranslations("labels");
  const policyTitles = useTranslations("storefront.policies");
  const locale = useLocale();

  function toggleLanguage(code: string, on: boolean) {
    const next = on ? [...new Set([...languages, code])] : languages.filter((c) => c !== code);
    // At least one language stays enabled, and the default is always one of them.
    if (next.length === 0) return;
    setLanguages(next);
    if (!next.includes(defaultLanguage)) setDefaultLanguage(LOCALES.find((l) => next.includes(l)) ?? next[0]);
  }

  function toggleCurrency(code: string, on: boolean) {
    setCurrencies((prev) => (on ? [...new Set([...prev, code])] : prev.filter((c) => c !== code)));
  }

  return (
    <div className="space-y-5">
      <Step
        step="branding"
        title={t("branding")}
        description={t("brandingDescription")}
        status={status}
      >
        <TemplateField storeId={store.id} template={template} canChange={canEditStorefront} />
        <ActionForm action={saveBranding} submitLabel={t("saveLogo")} hidden={hidden} className="mt-6">
          {(state) => <LogoField store={store} invalid={state.field === "logo"} />}
        </ActionForm>
      </Step>

      <Step
        step="languages"
        title={t("languages")}
        description={t("languagesDescription")}
        status={status}
      >
        <ActionForm action={saveLanguages} submitLabel={t("saveLanguages")} hidden={hidden}>
          {(state) => (
            <>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="grid content-start gap-1.5">
                  <Label htmlFor="defaultLanguage">{t("defaultLanguage")}</Label>
                  <Select name="defaultLanguage" value={defaultLanguage} onValueChange={setDefaultLanguage}>
                    <SelectTrigger
                      id="defaultLanguage"
                      className="w-full"
                      aria-invalid={state.field === "defaultLanguage" ? true : undefined}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LOCALES.filter((code) => languages.includes(code)).map((code) => (
                        <SelectItem key={code} value={code}>
                          {languageOption(locale, code, LOCALE_NAMES[code])}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{t("defaultLanguageHint")}</p>
                </div>
              </div>

              <fieldset className="mt-6" aria-invalid={state.field === "languages" ? true : undefined}>
                <legend className="text-sm leading-none font-medium text-foreground select-none">
                  {t("enabledLanguages")}
                </legend>
                <p className="mt-1.5 mb-3 text-xs text-muted-foreground">
                  <span className="tabular-nums">{t("selected", { count: languages.length })}</span>
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {LOCALES.map((code) => (
                    <Label
                      key={code}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-normal hover:bg-muted has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                    >
                      <Checkbox
                        name="languages"
                        value={code}
                        checked={languages.includes(code)}
                        onCheckedChange={(checked) => toggleLanguage(code, checked === true)}
                      />
                      <span className="truncate text-foreground">{languageOption(locale, code, LOCALE_NAMES[code])}</span>
                    </Label>
                  ))}
                </div>
              </fieldset>
            </>
          )}
        </ActionForm>
      </Step>

      <Step
        step="localisation"
        title={t("localisation")}
        description={t("localisationDescription")}
        status={status}
      >
        <ActionForm action={saveLocalisation} submitLabel={t("saveLocalisation")} hidden={hidden}>
          {(state) => (
            <>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="grid content-start gap-1.5">
                  <Label htmlFor="defaultCurrency">{t("defaultCurrency")}</Label>
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
                  <p className="text-xs text-muted-foreground">{t("defaultCurrencyHint")}</p>
                </div>
              </div>

              <fieldset className="mt-6">
                <legend className="text-sm leading-none font-medium text-foreground select-none">
                  {t("sellingCurrencies")}
                </legend>
                <p className="mt-1.5 mb-3 text-xs text-muted-foreground">
                  <span className="tabular-nums">{t("selected", { count: currencies.length })}</span>
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
                      <span className="truncate text-xs font-normal text-muted-foreground">{currencyName(locale, c.code, c.label)}</span>
                    </Label>
                  ))}
                </div>
              </fieldset>
            </>
          )}
        </ActionForm>
        <div className="mt-8 border-t border-border pt-6">
          <h3 className="text-sm font-semibold text-foreground">{t("rates.title")}</h3>
          <p className="mt-1 mb-4 max-w-2xl text-xs text-muted-foreground">{t("rates.description")}</p>
          <CurrencyRates store={store} />
        </div>
      </Step>

      <Step
        step="support"
        title={t("support")}
        description={t("supportDescription")}
        status={status}
      >
        <ActionForm action={saveSupport} submitLabel={t("saveSupport")} hidden={hidden}>
          {(state) => (
            <div className="grid max-w-2xl gap-5 sm:grid-cols-2">
              <div className="grid content-start gap-1.5">
                <Label htmlFor="supportEmail">{t("supportEmail")}</Label>
                <Input
                  id="supportEmail"
                  name="supportEmail"
                  type="email"
                  defaultValue={store.supportEmail ?? ""}
                  placeholder="support@yourclient.com"
                  aria-invalid={state.field === "supportEmail" ? true : undefined}
                                  />
              </div>
              <div className="grid content-start gap-1.5">
                <Label htmlFor="supportPhone">
                  {t("supportPhone")} <span className="font-normal text-muted-foreground">{t("optional")}</span>
                </Label>
                <Input
                  id="supportPhone"
                  name="supportPhone"
                  type="tel"
                  defaultValue={store.supportPhone ?? ""}
                  placeholder="+1 503 555 0142"
                  aria-invalid={state.field === "supportPhone" ? true : undefined}
                                  />
              </div>
            </div>
          )}
        </ActionForm>
      </Step>

      <Step
        step="domain"
        title={t("domain")}
        description={t("domainDescription")}
        status={status}
      >
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {store.customDomain ? (
            <>
              <span className="font-medium break-all text-foreground">{store.customDomain}</span>
              <Badge tone={store.domainStatus === "verified" ? "green" : "amber"}>
                {store.domainStatus === "verified" ? t("domainVerified") : t("domainPending")}
              </Badge>
            </>
          ) : (
            <span className="text-muted-foreground">{t("domainNone")}</span>
          )}
          <Link href={`/app/stores/${store.id}/domains`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            {t("manageDomains")}
          </Link>
        </div>
      </Step>

      <Step
        step="payments"
        title={t("stripe")}
        description={t("stripeDescription")}
        status={status}
      >
        <StripeStep store={store} />
      </Step>

      <Step
        step="shipping"
        title={t("carriers")}
        description={t("carriersDescription")}
        status={status}
      >
        <ActionForm action={saveCarriers} submitLabel={t("saveCarriers")} hidden={hidden}>
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
                      {t("accountNumber")}
                    </Label>
                    <Input
                      id={`${carrier.carrier}_account`}
                      name={`${carrier.carrier}_account`}
                      defaultValue={carrier.accountNumber}
                      placeholder={t("requiredWhenEnabled")}
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
        step="zones"
        title={t("zones")}
        description={t("zonesDescription")}
        status={status}
      >
        <Link href={`/app/stores/${store.id}/shipping`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          {t("manageZones")}
        </Link>
      </Step>

      <Step
        step="tax"
        title={t("tax")}
        description={t("taxDescription")}
        status={status}
      >
        <ActionForm action={saveTaxSettings} submitLabel={t("saveTax")} hidden={hidden}>
          {(state) => (
            <>
              <div className="grid max-w-xl gap-1.5">
                <Label htmlFor="defaultTaxBracketId">{t("defaultBracket")}</Label>
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
                    <SelectItem value={NO_BRACKET}>{t("selectBracket")}</SelectItem>
                    {brackets.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} · {b.rate}% ({b.code})
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
                    {t("pricesIncludeTax")}
                  </span>
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    {t("pricesIncludeTaxHint")}
                  </span>
                </Label>
              </div>
              <div className="relative mt-5 overflow-x-auto rounded-xl border border-border">
                <Table className="min-w-[30rem]">
                  <TableHeader className="bg-canvas">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className={TH}>{t("colBracket")}</TableHead>
                      <TableHead className={TH}>{t("colRate")}</TableHead>
                      <TableHead className={TH}>{t("colAppliesTo")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {brackets.map((b) => (
                      <TableRow key={b.id} className="hover:bg-transparent">
                        <TableCell className="px-3 py-2 font-medium text-foreground">{b.name}</TableCell>
                        <TableCell className="px-3 py-2 tabular-nums text-inksoft">{b.rate}%</TableCell>
                        <TableCell className="px-3 py-2 whitespace-normal text-muted-foreground">
                          {b.regions
                            .map((r) =>
                              labels.has(`region.${r}` as "region.APAC") ? labels(`region.${r}` as "region.APAC") : r,
                            )
                            .join(", ")}
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
      <Step
        step="policies"
        title={t("policies")}
        description={t("policiesDescription")}
        status={status}
      >
        {(() => {
          const { locales: storeLocales, defaultLocale: storeDefault } = storeLanguages(store);
          return (
            <ActionForm
              key={policyLanguage}
              action={savePolicies}
              submitLabel={t("savePolicies")}
              hidden={{ ...hidden, language: policyLanguage }}
            >
              {(state) => (
                <div className="grid max-w-3xl gap-5">
                  {storeLocales.length > 1 ? (
                    <div className="grid max-w-xs gap-1.5">
                      <Label htmlFor="policyLanguage">{t("policyLanguage")}</Label>
                      <Select value={policyLanguage} onValueChange={setPolicyLanguage}>
                        <SelectTrigger id="policyLanguage" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {storeLocales.map((code) => (
                            <SelectItem key={code} value={code}>
                              {languageOption(locale, code, LOCALE_NAMES[code])}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  <p className="text-xs text-muted-foreground">{t("policiesHint")}</p>
                  {POLICY_KEYS.map((key) => (
                    <div key={key} className="grid gap-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor={`policy-${key}`}>{policyTitles(key)}</Label>
                        <a
                          href={storeUrl(store, policyLanguage as Locale, `/policies/${key}`)}
                          target="_blank"
                          rel="noopener"
                          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                        >
                          {t("viewPolicy")}
                        </a>
                      </div>
                      <Textarea
                        id={`policy-${key}`}
                        name={key}
                        rows={8}
                        maxLength={POLICY_MAX_LENGTH}
                        defaultValue={
                          storePolicyText(store, key, policyLanguage, storeDefault) ??
                          policyDefaults[policyLanguage]?.[key] ??
                          ""
                        }
                        aria-invalid={state.field === key ? true : undefined}
                        className="max-h-96 min-h-40 font-mono text-xs leading-relaxed md:text-xs"
                      />
                    </div>
                  ))}
                </div>
              )}
            </ActionForm>
          );
        })()}
      </Step>
    </div>
  );
}

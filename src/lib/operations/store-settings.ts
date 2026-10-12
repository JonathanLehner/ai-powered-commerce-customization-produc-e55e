import "server-only";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { LOCALES, isLocale, type Locale } from "@/i18n/locales";
import { storeLanguages } from "@/i18n/storefront-routing";
import { storeLimitText } from "@/i18n/plan-copy";
import { countActiveStoresForAgency, getAgency, listTaxBrackets, recordAudit, updateStore } from "../data";
import { siteOrigin } from "../email";
import { storeAllowance } from "../plans";
import { POLICY_KEYS, POLICY_MAX_LENGTH, normalizePolicy, type PolicyKey, type StorePolicies } from "../policies";
import { forgetStorePolicies } from "../storefront-data";
import { createExpressAccount, onboardingLink } from "../stripe";
import { isSupportEmail, isSupportPhone } from "../support";
import type { CarrierAccount, Store, ThemeKey } from "../types";
import { STRIPE_COUNTRIES } from "../util";
import { OperationError, type OperationContext } from "./context";

/**
 * A store's own settings: its name and status, branding, languages,
 * currencies, shopper support contacts, policies, domain, payments, carriers
 * and default tax. The workspace's settings forms and the Admin
 * API both run these. Each returns the store as saved.
 */

function audit(ctx: OperationContext, action: string, summary: string, meta: Record<string, string | number | boolean | null>) {
  recordAudit({
    category: "store_setup",
    action,
    summary,
    storeId: ctx.store.id,
    agencyId: ctx.store.agencyId,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "store",
    entityId: ctx.store.id,
    meta,
  });
}

async function messages(ctx: OperationContext) {
  return getTranslations({ locale: ctx.locale, namespace: "actions.stores" });
}

export async function renameStore(ctx: OperationContext, input: { name: string; clientName: string }): Promise<Store> {
  const { store } = ctx;
  const name = input.name.trim();
  const clientName = input.clientName.trim();
  const t = await messages(ctx);
  if (name.length < 3) throw new OperationError("invalid", t("nameTooShort"), "name");
  if (!clientName) throw new OperationError("invalid", t("clientRequired"), "clientName");

  await updateStore(store.id, { name, clientName });
  audit(ctx, "store.renamed", `Renamed store to “${name}” (${clientName})`, { from: store.name, to: name });
  revalidatePath("/app");
  revalidatePath(`/app/stores/${store.id}`);
  return { ...store, name, clientName };
}

export async function saveBranding(ctx: OperationContext, input: { theme: ThemeKey; logoUrl: string | null }): Promise<Store> {
  const { store } = ctx;
  const { theme, logoUrl } = input;
  const setup = { ...store.setup, branding: Boolean(logoUrl) };
  await updateStore(store.id, { theme, logoUrl, setup });
  audit(ctx, "store.branding_updated", `Updated branding: theme “${theme}”${logoUrl !== store.logoUrl ? " and a new logo" : ""}`, {
    theme,
  });
  revalidatePath(`/app/stores/${store.id}/setup`);
  revalidatePath(`/s/${store.slug}`);
  return { ...store, theme, logoUrl, setup };
}

/** "German" for "de". The audit history is written in English. */
function englishName(code: string): string {
  return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
}

export async function saveLanguages(
  ctx: OperationContext,
  input: { languages: string[]; defaultLanguage: string },
): Promise<Store> {
  const { store } = ctx;
  const t = await messages(ctx);
  const chosen = new Set(input.languages);
  const languages: Locale[] = LOCALES.filter((code) => chosen.has(code));
  const defaultLanguage = input.defaultLanguage;

  if (languages.length === 0) throw new OperationError("invalid", t("languageRequired"), "languages");
  if (!isLocale(defaultLanguage) || !languages.includes(defaultLanguage)) {
    throw new OperationError("invalid", t("defaultLanguageRequired"), "defaultLanguage");
  }

  const before = storeLanguages(store);
  const unchanged = before.defaultLocale === defaultLanguage && before.locales.join(",") === languages.join(",");
  if (!unchanged) {
    await updateStore(store.id, { defaultLanguage, languages });
    audit(
      ctx,
      "store.languages_updated",
      `Set the storefront languages to ${languages.map(englishName).join(", ")} (default ${englishName(defaultLanguage)}), previously ${before.locales.map(englishName).join(", ")} (default ${englishName(before.defaultLocale)})`,
      {
        languages: languages.join(","),
        defaultLanguage,
        previousLanguages: before.locales.join(","),
        previousDefaultLanguage: before.defaultLocale,
      },
    );
  }
  revalidatePath(`/app/stores/${store.id}/setup`);
  // The languages decide every storefront and gift portal address and its copy.
  revalidatePath(`/s/${store.slug}`, "layout");
  revalidatePath("/g", "layout");
  return { ...store, defaultLanguage, languages };
}

export async function saveCurrencies(
  ctx: OperationContext,
  input: { currencies: string[]; defaultCurrency: string },
): Promise<Store> {
  const { store } = ctx;
  const t = await messages(ctx);
  const { currencies, defaultCurrency } = input;
  if (currencies.length === 0) throw new OperationError("invalid", t("currencyRequired"), "currencies");
  if (!currencies.includes(defaultCurrency)) {
    throw new OperationError("invalid", t("defaultCurrencyRequired"), "defaultCurrency");
  }

  const setup = { ...store.setup, localisation: true };
  await updateStore(store.id, { currencies, defaultCurrency, setup });
  audit(ctx, "store.localisation_updated", `Set the selling currencies to ${currencies.join(", ")} (default ${defaultCurrency})`, {
    defaultCurrency,
  });
  revalidatePath(`/app/stores/${store.id}/setup`);
  // The currencies decide the storefront's prices, so every page of it is
  // stale once this saves.
  revalidatePath(`/s/${store.slug}`, "layout");
  return { ...store, currencies, defaultCurrency, setup };
}

/**
 * The support contacts a shopper is given on the order status page and in the
 * storefront footer. The address is required: it is the only working route
 * from a shopper with a problem back to the seller.
 */
export async function saveSupport(
  ctx: OperationContext,
  input: { supportEmail: string; supportPhone: string },
): Promise<Store> {
  const { store } = ctx;
  const t = await messages(ctx);
  const supportEmail = input.supportEmail.trim().toLowerCase();
  const supportPhone = input.supportPhone.trim();

  if (!supportEmail) throw new OperationError("invalid", t("supportEmailRequired"), "supportEmail");
  if (!isSupportEmail(supportEmail)) throw new OperationError("invalid", t("supportEmailInvalid"), "supportEmail");
  if (supportPhone && !isSupportPhone(supportPhone)) {
    throw new OperationError("invalid", t("supportPhoneInvalid"), "supportPhone");
  }

  const setup = { ...store.setup, support: true };
  await updateStore(store.id, { supportEmail, supportPhone: supportPhone || null, setup });
  audit(ctx, "store.support_updated", `Shopper support set to ${supportEmail}${supportPhone ? ` and ${supportPhone}` : ""}`, {
    supportEmail,
    supportPhone: supportPhone || null,
  });
  revalidatePath(`/app/stores/${store.id}/setup`);
  // The footer carries the contacts, so every storefront page is stale.
  revalidatePath(`/s/${store.slug}`, "layout");
  return { ...store, supportEmail, supportPhone: supportPhone || null, setup };
}

/**
 * Saves the store's policies in one language. A policy left empty, or matching
 * what shoppers would read without it, is not stored, so the store keeps
 * following the default text.
 */
export async function savePolicies(
  ctx: OperationContext,
  language: string,
  texts: Partial<Record<PolicyKey, string>>,
): Promise<Store> {
  const { store } = ctx;
  const t = await messages(ctx);
  const { locales, defaultLocale } = storeLanguages(store);
  if (!isLocale(language) || !locales.includes(language)) {
    throw new OperationError("invalid", t("policyLanguageInvalid"), "language");
  }

  const builtIn = await getTranslations({ locale: language, namespace: "storePolicies" });
  const own: Partial<Record<PolicyKey, string>> = {};
  for (const key of POLICY_KEYS) {
    const text = normalizePolicy(texts[key] ?? "");
    if (text.length > POLICY_MAX_LENGTH) {
      throw new OperationError("invalid", t("policyTooLong", { max: POLICY_MAX_LENGTH }), key);
    }
    const fallback =
      (language !== defaultLocale ? store.policies?.[defaultLocale]?.[key] : null) ||
      builtIn(key, { store: store.name });
    if (text && text !== normalizePolicy(fallback)) own[key] = text;
  }

  const policies: StorePolicies = { ...(store.policies ?? {}), [language]: own };
  const policiesVersion = new Date().toISOString();
  await updateStore(store.id, { policies, policiesVersion });
  forgetStorePolicies(store.id);
  audit(ctx, "store.policies_updated", `Store policies updated (${language})`, {
    language,
    edited: Object.keys(own).join(", "),
  });
  revalidatePath(`/app/stores/${store.id}/setup`);
  revalidatePath(`/s/${store.slug}`, "layout");
  return { ...store, policies, policiesVersion };
}

/**
 * Archives a store or brings it back. Restoring puts a storefront back online,
 * so it counts against the agency's plan the same way creating one does: at
 * the limit it is refused as a conflict, with the plan's explanation.
 */
export async function setStoreStatus(ctx: OperationContext, status: Store["status"]): Promise<Store> {
  const { store } = ctx;
  if (store.status === status) return store;

  if (status === "active") {
    const [agency, activeStores] = await Promise.all([
      getAgency(store.agencyId),
      countActiveStoresForAgency(store.agencyId),
    ]);
    const allowance = agency ? storeAllowance(agency.plan, activeStores) : null;
    if (agency && allowance?.atLimit) {
      throw new OperationError("conflict", await storeLimitText(allowance, agency.name, ctx.locale), "status");
    }
  }

  const archivedAt = status === "archived" ? new Date().toISOString() : null;
  await updateStore(store.id, { status, archivedAt });
  recordAudit({
    category: "administration",
    action: status === "archived" ? "store.archived" : "store.restored",
    summary:
      status === "archived"
        ? `Archived store “${store.name}”`
        : `Restored store “${store.name}” to active`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "store",
    entityId: store.id,
    meta: {},
  });
  revalidatePath("/app");
  revalidatePath(`/app/stores/${store.id}`);
  return { ...store, status, archivedAt };
}

/**
 * Sets, verifies or (given an empty domain) removes the store's custom domain.
 * Returns the store as saved; its `customDomain` is null once removed.
 */
export async function saveDomain(ctx: OperationContext, input: { domain: string; verify: boolean }): Promise<Store> {
  const { store } = ctx;
  const t = await messages(ctx);
  const raw = input.domain.trim().toLowerCase();

  if (!raw) {
    const setup = { ...store.setup, domain: false };
    await updateStore(store.id, { customDomain: null, domainStatus: "unset", setup });
    revalidatePath(`/app/stores/${store.id}/setup`);
    return { ...store, customDomain: null, domainStatus: "unset", setup };
  }

  const domain = raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
    throw new OperationError("invalid", t("domainInvalid"), "customDomain");
  }

  const domainStatus = input.verify ? "verified" : "pending";
  const setup = { ...store.setup, domain: domainStatus === "verified" };
  await updateStore(store.id, { customDomain: domain, domainStatus, setup });
  audit(
    ctx,
    input.verify ? "store.domain_verified" : "store.domain_set",
    input.verify ? `Verified custom domain ${domain}` : `Set custom domain ${domain}, awaiting DNS verification`,
    { domain },
  );
  revalidatePath(`/app/stores/${store.id}/setup`);
  return { ...store, customDomain: domain, domainStatus, setup };
}

/**
 * Starts or continues Stripe payments for the store: creates its Express
 * account on the first call, or reuses it to continue or update onboarding,
 * and returns the Stripe-hosted onboarding address for an administrator to
 * open. `country` is used only when the account is created; null keeps the
 * store's.
 */
export async function connectStripe(
  ctx: OperationContext,
  input: { country: string | null },
): Promise<{ store: Store; onboardingUrl: string }> {
  let { store } = ctx;
  const storeId = store.id;
  const t = await messages(ctx);

  let accountId = store.stripe.express ? store.stripe.accountId : null;
  if (!accountId) {
    const country = input.country ?? store.stripe.country;
    if (!STRIPE_COUNTRIES.some((c) => c.code === country)) throw new OperationError("invalid", t("stripeCountry"), "country");
    const account = await createExpressAccount({
      storeId,
      country,
      email: store.supportEmail ?? null,
      // A double click lands on the same account; connecting again after a
      // disconnect makes a new one.
      attempt: `${country}-${store.stripe.previousAccountId ?? "first"}`,
    });
    if (!account) throw new OperationError("payment_failed", t("stripeUnavailable"));
    accountId = account.accountId;
    const patch = {
      stripe: {
        connected: true,
        express: true,
        accountId,
        country: account.country,
        chargesEnabled: account.chargesEnabled,
        payoutsEnabled: account.payoutsEnabled,
        detailsSubmitted: account.detailsSubmitted,
        connectedAt: new Date().toISOString(),
        previousAccountId: store.stripe.previousAccountId ?? null,
      },
      setup: { ...store.setup, payments: account.chargesEnabled },
    };
    await updateStore(storeId, patch);
    store = { ...store, ...patch };
    audit(ctx, "store.stripe_account_created", `Created Stripe account ${accountId} (${account.country})`, {
      accountId,
      country: account.country,
    });
  }

  const origin = await siteOrigin();
  const back = `${origin}/app/stores/${storeId}/setup/stripe`;
  const link = await onboardingLink(accountId, `${back}/refresh`, back);
  if (!link) throw new OperationError("payment_failed", t("stripeUnavailable"));
  audit(ctx, "store.stripe_onboarding_started", `Opened Stripe onboarding for ${accountId}`, { accountId });
  revalidatePath(`/app/stores/${storeId}/setup`);
  return { store, onboardingUrl: link };
}

/** Disconnects the store's Stripe account; checkout stops taking card payments. */
export async function disconnectStripe(ctx: OperationContext): Promise<Store> {
  const { store } = ctx;
  const previous = store.stripe.accountId;
  const patch = {
    stripe: {
      connected: false,
      accountId: null,
      country: store.stripe.country,
      chargesEnabled: false,
      connectedAt: null,
      previousAccountId: store.stripe.express ? previous : (store.stripe.previousAccountId ?? null),
    },
    setup: { ...store.setup, payments: false },
  };
  await updateStore(store.id, patch);
  audit(ctx, "store.stripe_disconnected", previous ? `Disconnected Stripe account ${previous}` : "Disconnected the Stripe account", {
    accountId: previous,
  });
  revalidatePath(`/app/stores/${store.id}/setup`);
  return { ...store, ...patch };
}

/**
 * Switches the store's carriers on or off with their account numbers. A
 * carrier left out keeps its settings, and one left without an account number
 * keeps the one it has. At least one carrier must stay enabled.
 */
export async function saveCarriers(
  ctx: OperationContext,
  input: { carrier: CarrierAccount["carrier"]; enabled: boolean; accountNumber?: string }[],
): Promise<Store> {
  const { store } = ctx;
  const t = await messages(ctx);

  const carriers = store.carriers.map((c) => {
    const entry = input.find((e) => e.carrier === c.carrier);
    if (!entry) return c;
    return { ...c, enabled: entry.enabled, accountNumber: (entry.accountNumber ?? c.accountNumber).trim() };
  });

  const missing = carriers.find((c) => c.enabled && !c.accountNumber);
  if (missing) {
    throw new OperationError(
      "invalid",
      t("carrierAccount", { carrier: missing.carrier.toUpperCase() }),
      `${missing.carrier}_account`,
    );
  }
  if (!carriers.some((c) => c.enabled)) throw new OperationError("invalid", t("carrierRequired"), "dhl_enabled");

  const setup = { ...store.setup, shipping: true };
  await updateStore(store.id, { carriers, setup });
  audit(
    ctx,
    "store.carriers_updated",
    `Shipping carriers set to ${carriers.filter((c) => c.enabled).map((c) => c.carrier.toUpperCase()).join(", ")}`,
    {},
  );
  revalidatePath(`/app/stores/${store.id}/setup`);
  return { ...store, carriers, setup };
}

/**
 * The default tax bracket a product is filed under until it is given its own,
 * and whether displayed prices include tax. The bracket must be one of the
 * platform's.
 */
export async function saveDefaultTax(
  ctx: OperationContext,
  input: { defaultTaxBracketId: string; pricesIncludeTax: boolean },
): Promise<Store> {
  const { store } = ctx;
  const t = await messages(ctx);
  const { defaultTaxBracketId, pricesIncludeTax } = input;
  if (!defaultTaxBracketId || !(await listTaxBrackets()).some((bracket) => bracket.id === defaultTaxBracketId)) {
    throw new OperationError("invalid", t("taxRequired"), "defaultTaxBracketId");
  }

  const setup = { ...store.setup, tax: true };
  await updateStore(store.id, { defaultTaxBracketId, pricesIncludeTax, setup });
  audit(
    ctx,
    "store.tax_updated",
    `Default tax bracket set; displayed prices ${pricesIncludeTax ? "include" : "exclude"} tax`,
    { defaultTaxBracketId, pricesIncludeTax },
  );
  revalidatePath(`/app/stores/${store.id}/setup`);
  return { ...store, defaultTaxBracketId, pricesIncludeTax, setup };
}

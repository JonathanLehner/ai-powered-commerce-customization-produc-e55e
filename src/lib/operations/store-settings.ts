import "server-only";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { LOCALES, isLocale, type Locale } from "@/i18n/locales";
import { storeLanguages } from "@/i18n/storefront-routing";
import { recordAudit, updateStore } from "../data";
import { POLICY_KEYS, POLICY_MAX_LENGTH, normalizePolicy, type PolicyKey, type StorePolicies } from "../policies";
import { forgetStorePolicies } from "../storefront-data";
import { isSupportEmail, isSupportPhone } from "../support";
import type { Store, ThemeKey } from "../types";
import { OperationError, type OperationContext } from "./context";

/**
 * A store's own settings: its name, branding, languages, currencies, shopper
 * support contacts and policies. The workspace's settings forms and the Admin
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

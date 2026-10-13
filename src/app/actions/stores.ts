"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { refusal } from "@/lib/operations/action-state";
import { isOperationError } from "@/lib/operations/context";
import { agencyStores, createStore as openStore } from "@/lib/operations/agency";
import {
  connectStripe as startStripeOnboarding,
  disconnectStripe as stopStripe,
  renameStore as rename,
  saveBranding as brand,
  saveCarriers as setCarriers,
  refreshExchangeRates as refreshRates,
  saveCurrencies as setCurrencies,
  saveCurrencyRates as setCurrencyRates,
  saveDefaultTax as setDefaultTax,
  saveLanguages as setLanguages,
  savePolicies as setPolicies,
  saveSupport as setSupport,
  setStoreStatus as setStatus,
} from "@/lib/operations/store-settings";
import { POLICY_KEYS } from "@/lib/policies";
import { assertAgencyAdmin, assertStoreAccess, getSessionUser, operationContext } from "@/lib/session";
import { readStoredImage } from "@/lib/uploads";
import type { RoundingRule } from "@/lib/currency";
import type { Store, ThemeKey } from "@/lib/types";

export interface ActionState {
  status: "idle" | "error" | "success";
  message?: string;
  field?: string;
}

function ok(message: string): ActionState {
  return { status: "success", message };
}
function fail(message: string, field?: string): ActionState {
  return { status: "error", message, field };
}

/* ------------------------------------------------------------ create store */

export async function createStore(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getSessionUser();
  const t = await getTranslations("actions.stores");
  if (!user) return fail((await getTranslations("actions.common"))("signedOut"));
  if (user.platformRole !== "agency_admin" && user.platformRole !== "platform_admin") {
    return fail(t("onlyAgencyAdmins"));
  }
  const agencyId = user.agencyId ?? String(formData.get("agencyId") ?? "");
  if (!agencyId) return fail(t("chooseAgency"), "agencyId");

  // The plan is checked before anything else (see the operation): the create
  // screen already refuses at the limit, so a refusal here is a stale tab or a
  // second submission that would have taken the agency past what it pays for.
  let store: Store;
  try {
    store = await openStore(
      { agencyId, actor: { id: user.id, name: user.name }, locale: await getLocale() },
      {
        name: String(formData.get("name") ?? ""),
        clientName: String(formData.get("clientName") ?? ""),
        defaultCurrency: String(formData.get("defaultCurrency") ?? "USD"),
        defaultLanguage: String(formData.get("defaultLanguage") ?? ""),
        theme: String(formData.get("theme") ?? "atelier"),
      },
    );
  } catch (error) {
    return refusal(error);
  }

  redirect(`/app/stores/${store.id}/setup?created=1`);
}

/* --------------------------------------------------------- rename / archive */

export async function renameStore(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const t = await getTranslations("actions.stores");
  const access = await assertStoreAccess(storeId, "store.settings");
  try {
    await rename(await operationContext(access), {
      name: String(formData.get("name") ?? ""),
      clientName: String(formData.get("clientName") ?? ""),
    });
  } catch (error) {
    return refusal(error);
  }
  return ok(t("renamed"));
}

export async function setStoreStatus(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const status = String(formData.get("status") ?? "") as Store["status"];
  if (status !== "active" && status !== "archived") return;

  const access = await assertStoreAccess(storeId, "store.settings");
  // Restoring counts against the plan the same way creating a store does; the
  // store page explains the refusal.
  let atLimit = false;
  try {
    await setStatus(await operationContext(access), status);
  } catch (error) {
    if (!isOperationError(error) || error.code !== "conflict") throw error;
    atLimit = true;
  }
  if (atLimit) redirect(`/app/stores/${storeId}?limit=1`);
}

/* ---------------------------------------------------------------- settings */

export async function saveBranding(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, "store.settings");
  const { store } = access;
  const t = await getTranslations("actions.stores");

  // The logo goes to /api/uploads before the form is submitted: a file posted
  // through the action itself would exceed the 1 MB Server Action body limit.
  const stored = readStoredImage(formData, "logo", "logo");
  const saved = await brand(await operationContext(access), {
    theme: String(formData.get("theme") ?? store.theme) as ThemeKey,
    logoUrl: stored ? stored.url : store.logoUrl,
  });
  return ok(saved.logoUrl !== store.logoUrl ? t("logoAndTheme") : t("themeSaved"));
}

export async function saveLanguages(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, "store.settings");
  const t = await getTranslations("actions.stores");
  try {
    await setLanguages(await operationContext(access), {
      languages: formData.getAll("languages").map(String),
      defaultLanguage: String(formData.get("defaultLanguage") ?? ""),
    });
  } catch (error) {
    return refusal(error);
  }
  return ok(t("languagesSaved"));
}

export async function saveLocalisation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, "store.settings");
  const t = await getTranslations("actions.stores");
  try {
    await setCurrencies(await operationContext(access), {
      currencies: formData.getAll("currencies").map(String),
      defaultCurrency: String(formData.get("defaultCurrency") ?? ""),
    });
  } catch (error) {
    return refusal(error);
  }
  return ok(t("localisationSaved"));
}

/** Exchange rate and rounding for each presentment currency. */
export async function saveCurrencyRates(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, "store.settings");
  const t = await getTranslations("actions.stores");
  const codes = formData.getAll("rateCurrency").map(String);
  try {
    await setCurrencyRates(
      await operationContext(access),
      Object.fromEntries(
        codes.map((code) => [
          code,
          {
            mode: formData.get(`mode_${code}`) === "manual" ? "manual" : "auto",
            rate: Number(String(formData.get(`rate_${code}`) ?? "").replace(",", ".")) || null,
            rounding: String(formData.get(`rounding_${code}`) ?? "none") as RoundingRule,
          },
        ]),
      ),
    );
  } catch (error) {
    return refusal(error);
  }
  return ok(t("ratesSaved"));
}

export async function refreshExchangeRates(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, "store.settings");
  const t = await getTranslations("actions.stores");
  try {
    await refreshRates(await operationContext(access));
  } catch (error) {
    return refusal(error);
  }
  return ok(t("ratesRefreshed"));
}

/** The support contacts a shopper is given on the order status page and in the storefront footer. */
export async function saveSupport(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, "store.settings");
  const t = await getTranslations("actions.stores");
  try {
    const saved = await setSupport(await operationContext(access), {
      supportEmail: String(formData.get("supportEmail") ?? ""),
      supportPhone: String(formData.get("supportPhone") ?? ""),
    });
    return ok(saved.supportPhone ? t("supportBothSaved") : t("supportEmailSaved"));
  } catch (error) {
    return refusal(error);
  }
}

/** Saves the store's policies in one language. */
export async function savePolicies(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, "store.settings");
  const t = await getTranslations("actions.stores");
  try {
    await setPolicies(
      await operationContext(access),
      String(formData.get("language") ?? ""),
      Object.fromEntries(POLICY_KEYS.map((key) => [key, String(formData.get(key) ?? "")])),
    );
  } catch (error) {
    return refusal(error);
  }
  return ok(t("policiesSaved"));
}

/**
 * "Connect Stripe" in guided setup: creates the store's Express account on the
 * first visit, or reuses it to continue or update onboarding, then sends the
 * administrator to Stripe's hosted onboarding.
 */
export async function connectStripe(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, "store.settings");
  let link: string;
  try {
    const started = await startStripeOnboarding(await operationContext(access), {
      country: formData.has("country") ? String(formData.get("country")) : null,
    });
    link = started.onboardingUrl;
  } catch (error) {
    return refusal(error);
  }
  redirect(link);
}

export async function disconnectStripe(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, "store.settings");
  await stopStripe(await operationContext(access));
}

export async function saveCarriers(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, "store.settings");
  const t = await getTranslations("actions.stores");
  try {
    await setCarriers(
      await operationContext(access),
      access.store.carriers.map((c) => ({
        carrier: c.carrier,
        enabled: formData.get(`${c.carrier}_enabled`) === "on",
        accountNumber: String(formData.get(`${c.carrier}_account`) ?? ""),
      })),
    );
  } catch (error) {
    return refusal(error);
  }
  return ok(t("carriersSaved"));
}

export async function saveTaxSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, "store.settings");
  const t = await getTranslations("actions.stores");
  try {
    await setDefaultTax(await operationContext(access), {
      defaultTaxBracketId: String(formData.get("defaultTaxBracketId") ?? ""),
      pricesIncludeTax: formData.get("pricesIncludeTax") === "on",
    });
  } catch (error) {
    return refusal(error);
  }
  return ok(t("taxSaved"));
}

/** The signed-in agency administrator's own stores, archived ones included. */
export async function storesForAgency(): Promise<Store[]> {
  const user = await assertAgencyAdmin();
  return agencyStores(user);
}

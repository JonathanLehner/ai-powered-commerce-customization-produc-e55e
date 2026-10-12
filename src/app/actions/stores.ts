"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  COLLECTIONS,
  countActiveStoresForAgency,
  getAgency,
  getStore,
  getStoreBySlug,
  listStoresForAgency,
  recordAudit,
  updateStore,
} from "@/lib/data";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/locales";
import { db } from "@/lib/mongo";
import { refusal } from "@/lib/operations/action-state";
import {
  renameStore as rename,
  saveBranding as brand,
  saveCurrencies as setCurrencies,
  saveLanguages as setLanguages,
  savePolicies as setPolicies,
  saveSupport as setSupport,
} from "@/lib/operations/store-settings";
import { POLICY_KEYS } from "@/lib/policies";
import { storeLimitText } from "@/i18n/plan-copy";
import { billingPending } from "@/lib/billing";
import { storeAllowance } from "@/lib/plans";
import { assertStoreAccess, getSessionUser, operationContext } from "@/lib/session";
import { siteOrigin } from "@/lib/email";
import { createExpressAccount, onboardingLink } from "@/lib/stripe";
import { treeFromSections } from "@/lib/storefront-schema";
import { readStoredImage } from "@/lib/uploads";
import type { Store, ThemeKey } from "@/lib/types";
import { STRIPE_COUNTRIES, newId, slugify } from "@/lib/util";

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

  // The plan is checked before anything else: the create screen already refuses
  // at the limit, so reaching here means a stale tab or a second submission that
  // would have taken the agency past what it pays for.
  const [agency, activeStores] = await Promise.all([
    getAgency(agencyId),
    countActiveStoresForAgency(agencyId),
  ]);
  if (!agency) return fail(t("agencyGone"), "agencyId");
  if (billingPending(agency)) return fail(t("paymentPending"));
  const allowance = storeAllowance(agency.plan, activeStores);
  if (allowance.atLimit) return fail(await storeLimitText(allowance, agency.name));

  const name = String(formData.get("name") ?? "").trim();
  const clientName = String(formData.get("clientName") ?? "").trim();
  const defaultCurrency = String(formData.get("defaultCurrency") ?? "USD");
  // Only a language the storefront can actually be rendered in is stored.
  const requestedLanguage = String(formData.get("defaultLanguage") ?? "");
  const defaultLanguage = isLocale(requestedLanguage) ? requestedLanguage : DEFAULT_LOCALE;
  const theme = String(formData.get("theme") ?? "atelier") as ThemeKey;

  if (name.length < 3) return fail(t("nameTooShort"), "name");
  if (!clientName) return fail(t("clientRequired"), "clientName");

  let slug = slugify(name);
  if (!slug) return fail(t("nameNotAddress"), "name");
  if (await getStoreBySlug(slug)) slug = `${slug}-${newId("x").slice(2, 6)}`;

  const now = new Date().toISOString();
  const store: Store = {
    id: newId("str"),
    agencyId,
    name,
    slug,
    channelCode: slug,
    clientName,
    status: "active",
    logoUrl: null,
    theme,
    defaultLanguage,
    languages: [defaultLanguage],
    currencies: [defaultCurrency],
    defaultCurrency,
    customDomain: null,
    domainStatus: "unset",
    supportEmail: null,
    supportPhone: null,
    stripe: { connected: false, accountId: null, country: "US", chargesEnabled: false, connectedAt: null },
    carriers: [
      { carrier: "dhl", enabled: false, accountNumber: "", services: ["Express Worldwide", "Economy Select"] },
      { carrier: "fedex", enabled: false, accountNumber: "", services: ["International Priority", "International Economy"] },
      { carrier: "ups", enabled: false, accountNumber: "", services: ["Worldwide Expedited", "Standard"] },
    ],
    defaultTaxBracketId: null,
    pricesIncludeTax: false,
    setup: {
      branding: false,
      localisation: true,
      support: false,
      domain: false,
      payments: false,
      shipping: false,
      tax: false,
    },
    createdAt: now,
    archivedAt: null,
  };

  await Promise.all([
    db.insertOne(COLLECTIONS.stores, store as unknown as Record<string, unknown>),
    db.insertOne(COLLECTIONS.storefronts, {
      id: newId("sfr"),
      storeId: store.id,
      draft: treeFromSections([
        { type: "HeroSection", props: { eyebrow: clientName, headline: `${clientName} merch, made to order` } },
        { type: "ProductGrid", props: {} },
      ]),
      published: null,
      publishedAt: null,
      publishedBy: null,
      draftUpdatedAt: now,
      history: [],
    }),
  ]);
  recordAudit({
    category: "store_setup",
    action: "store.created",
    summary: `Created store “${name}” for ${clientName}`,
    storeId: store.id,
    agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "store",
    entityId: store.id,
    meta: { currency: defaultCurrency, theme },
  });

  revalidatePath("/app");
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

  const { user, store } = await assertStoreAccess(storeId, "store.settings");
  if (store.status === status) return;

  // Restoring puts a storefront back online, so it counts against the plan the
  // same way creating one does. The store page explains the refusal.
  if (status === "active") {
    const [agency, activeStores] = await Promise.all([
      getAgency(store.agencyId),
      countActiveStoresForAgency(store.agencyId),
    ]);
    if (agency && storeAllowance(agency.plan, activeStores).atLimit) {
      redirect(`/app/stores/${storeId}?limit=1`);
    }
  }

  await updateStore(storeId, {
    status,
    archivedAt: status === "archived" ? new Date().toISOString() : null,
  });
  recordAudit({
    category: "administration",
    action: status === "archived" ? "store.archived" : "store.restored",
    summary:
      status === "archived"
        ? `Archived store “${store.name}”`
        : `Restored store “${store.name}” to active`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "store",
    entityId: storeId,
    meta: {},
  });
  revalidatePath("/app");
  revalidatePath(`/app/stores/${storeId}`);
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

export async function saveDomain(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const { user, store } = await assertStoreAccess(storeId, "store.settings");
  const t = await getTranslations("actions.stores");

  const raw = String(formData.get("customDomain") ?? "").trim().toLowerCase();
  const verify = formData.get("intent") === "verify";

  if (!raw) {
    await updateStore(storeId, {
      customDomain: null,
      domainStatus: "unset",
      setup: { ...store.setup, domain: false },
    });
    revalidatePath(`/app/stores/${storeId}/setup`);
    return ok(t("domainRemoved"));
  }

  const domain = raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
    return fail(t("domainInvalid"), "customDomain");
  }

  const status = verify ? "verified" : "pending";
  await updateStore(storeId, {
    customDomain: domain,
    domainStatus: status,
    setup: { ...store.setup, domain: status === "verified" },
  });
  recordAudit({
    category: "store_setup",
    action: verify ? "store.domain_verified" : "store.domain_set",
    summary: verify ? `Verified custom domain ${domain}` : `Set custom domain ${domain}, awaiting DNS verification`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "store",
    entityId: storeId,
    meta: { domain },
  });
  revalidatePath(`/app/stores/${storeId}/setup`);
  return ok(
    verify
      ? t("domainVerified", { domain })
      : t("domainSaved", { domain }),
  );
}

/**
 * "Connect Stripe" in guided setup: creates the store's Express account on the
 * first visit, or reuses it to continue or update onboarding, then sends the
 * administrator to Stripe's hosted onboarding.
 */
export async function connectStripe(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const { user, store } = await assertStoreAccess(storeId, "store.settings");
  const t = await getTranslations("actions.stores");

  let accountId = store.stripe.express ? store.stripe.accountId : null;
  if (!accountId) {
    const country = String(formData.get("country") ?? store.stripe.country);
    if (!STRIPE_COUNTRIES.some((c) => c.code === country)) return fail(t("stripeCountry"), "country");
    const account = await createExpressAccount({
      storeId,
      country,
      email: store.supportEmail ?? null,
      // A double click lands on the same account; connecting again after a
      // disconnect makes a new one.
      attempt: `${country}-${store.stripe.previousAccountId ?? "first"}`,
    });
    if (!account) return fail(t("stripeUnavailable"));
    accountId = account.accountId;
    await updateStore(storeId, {
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
    });
    recordAudit({
      category: "store_setup",
      action: "store.stripe_account_created",
      summary: `Created Stripe account ${accountId} (${account.country})`,
      storeId,
      agencyId: store.agencyId,
      actorId: user.id,
      actorName: user.name,
      entity: "store",
      entityId: storeId,
      meta: { accountId, country: account.country },
    });
  }

  const origin = await siteOrigin();
  const back = `${origin}/app/stores/${storeId}/setup/stripe`;
  const link = await onboardingLink(accountId, `${back}/refresh`, back);
  if (!link) return fail(t("stripeUnavailable"));
  recordAudit({
    category: "store_setup",
    action: "store.stripe_onboarding_started",
    summary: `Opened Stripe onboarding for ${accountId}`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "store",
    entityId: storeId,
    meta: { accountId },
  });
  revalidatePath(`/app/stores/${storeId}/setup`);
  redirect(link);
}

export async function disconnectStripe(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const { user, store } = await assertStoreAccess(storeId, "store.settings");
  const previous = store.stripe.accountId;
  await updateStore(storeId, {
    stripe: {
      connected: false,
      accountId: null,
      country: store.stripe.country,
      chargesEnabled: false,
      connectedAt: null,
      previousAccountId: store.stripe.express ? previous : (store.stripe.previousAccountId ?? null),
    },
    setup: { ...store.setup, payments: false },
  });
  recordAudit({
    category: "store_setup",
    action: "store.stripe_disconnected",
    summary: previous ? `Disconnected Stripe account ${previous}` : "Disconnected the Stripe account",
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "store",
    entityId: storeId,
    meta: { accountId: previous },
  });
  revalidatePath(`/app/stores/${storeId}/setup`);
}

export async function saveCarriers(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const { user, store } = await assertStoreAccess(storeId, "store.settings");
  const t = await getTranslations("actions.stores");

  const carriers = store.carriers.map((c) => {
    const enabled = formData.get(`${c.carrier}_enabled`) === "on";
    const accountNumber = String(formData.get(`${c.carrier}_account`) ?? "").trim();
    return { ...c, enabled, accountNumber };
  });

  const missing = carriers.find((c) => c.enabled && !c.accountNumber);
  if (missing) {
    return fail(
      t("carrierAccount", { carrier: missing.carrier.toUpperCase() }),
      `${missing.carrier}_account`,
    );
  }
  if (!carriers.some((c) => c.enabled)) {
    return fail(t("carrierRequired"), "dhl_enabled");
  }

  await updateStore(storeId, { carriers, setup: { ...store.setup, shipping: true } });
  recordAudit({
    category: "store_setup",
    action: "store.carriers_updated",
    summary: `Shipping carriers set to ${carriers.filter((c) => c.enabled).map((c) => c.carrier.toUpperCase()).join(", ")}`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "store",
    entityId: storeId,
    meta: {},
  });
  revalidatePath(`/app/stores/${storeId}/setup`);
  return ok(t("carriersSaved"));
}

export async function saveTaxSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const { user, store } = await assertStoreAccess(storeId, "store.settings");
  const t = await getTranslations("actions.stores");

  const defaultTaxBracketId = String(formData.get("defaultTaxBracketId") ?? "");
  const pricesIncludeTax = formData.get("pricesIncludeTax") === "on";
  if (!defaultTaxBracketId) return fail(t("taxRequired"), "defaultTaxBracketId");

  await updateStore(storeId, {
    defaultTaxBracketId,
    pricesIncludeTax,
    setup: { ...store.setup, tax: true },
  });
  recordAudit({
    category: "store_setup",
    action: "store.tax_updated",
    summary: `Default tax bracket set; displayed prices ${pricesIncludeTax ? "include" : "exclude"} tax`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "store",
    entityId: storeId,
    meta: { defaultTaxBracketId, pricesIncludeTax },
  });
  revalidatePath(`/app/stores/${storeId}/setup`);
  return ok(t("taxSaved"));
}

export async function ensureStoreExists(storeId: string) {
  const store = await getStore(storeId);
  if (!store) redirect("/app");
  return store;
}

export async function storesForAgency(agencyId: string) {
  return listStoresForAgency(agencyId);
}

/* ------------------------------- void wrappers for plain <form action={…}> */

export async function verifyDomain(formData: FormData): Promise<void> {
  await saveDomain({ status: "idle" }, formData);
}


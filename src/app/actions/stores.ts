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
import { DEFAULT_LOCALE, LOCALES, isLocale } from "@/i18n/locales";
import { storeLanguages } from "@/i18n/storefront-routing";
import { db } from "@/lib/mongo";
import { POLICY_KEYS, POLICY_MAX_LENGTH, normalizePolicy, type StorePolicies } from "@/lib/policies";
import { storeLimitText } from "@/i18n/plan-copy";
import { billingPending } from "@/lib/billing";
import { storeAllowance } from "@/lib/plans";
import { assertStoreAccess, getSessionUser } from "@/lib/session";
import { treeFromSections } from "@/lib/storefront-schema";
import { isSupportEmail, isSupportPhone } from "@/lib/support";
import { readStoredImage } from "@/lib/uploads";
import type { Store, ThemeKey } from "@/lib/types";
import { newId, slugify } from "@/lib/util";

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
  const name = String(formData.get("name") ?? "").trim();
  const clientName = String(formData.get("clientName") ?? "").trim();
  const t = await getTranslations("actions.stores");
  if (name.length < 3) return fail(t("nameTooShort"), "name");
  if (!clientName) return fail(t("clientRequired"), "clientName");

  const { user, store } = await assertStoreAccess(storeId, "store.settings");
  await updateStore(storeId, { name, clientName });
  recordAudit({
    category: "store_setup",
    action: "store.renamed",
    summary: `Renamed store to “${name}” (${clientName})`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "store",
    entityId: storeId,
    meta: { from: store.name, to: name },
  });
  revalidatePath("/app");
  revalidatePath(`/app/stores/${storeId}`);
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
  const { user, store } = await assertStoreAccess(storeId, "store.settings");
  const t = await getTranslations("actions.stores");

  const theme = String(formData.get("theme") ?? store.theme) as ThemeKey;
  // The logo goes to /api/uploads before the form is submitted — a file posted
  // through the action itself would exceed the 1 MB Server Action body limit.
  const stored = readStoredImage(formData, "logo", "logo");
  const logoUrl = stored ? stored.url : store.logoUrl;

  await updateStore(storeId, {
    theme,
    logoUrl,
    setup: { ...store.setup, branding: Boolean(logoUrl) },
  });
  recordAudit({
    category: "store_setup",
    action: "store.branding_updated",
    summary: `Updated branding: theme “${theme}”${logoUrl !== store.logoUrl ? " and a new logo" : ""}`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "store",
    entityId: storeId,
    meta: { theme },
  });
  revalidatePath(`/app/stores/${storeId}/setup`);
  revalidatePath(`/s/${store.slug}`);
  return ok(logoUrl !== store.logoUrl ? t("logoAndTheme") : t("themeSaved"));
}

export async function saveLanguages(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const { user, store } = await assertStoreAccess(storeId, "store.settings");
  const t = await getTranslations("actions.stores");

  const chosen = new Set(formData.getAll("languages").map(String));
  const languages = LOCALES.filter((code) => chosen.has(code));
  const defaultLanguage = String(formData.get("defaultLanguage") ?? "");

  if (languages.length === 0) return fail(t("languageRequired"), "languages");
  if (!isLocale(defaultLanguage) || !languages.includes(defaultLanguage)) {
    return fail(t("defaultLanguageRequired"), "defaultLanguage");
  }

  const before = storeLanguages(store);
  const unchanged =
    before.defaultLocale === defaultLanguage && before.locales.join(",") === languages.join(",");
  if (!unchanged) {
    await updateStore(storeId, { defaultLanguage, languages });
    recordAudit({
      category: "store_setup",
      action: "store.languages_updated",
      summary: `Set the storefront languages to ${languages.map(englishName).join(", ")} (default ${englishName(defaultLanguage)}), previously ${before.locales.map(englishName).join(", ")} (default ${englishName(before.defaultLocale)})`,
      storeId,
      agencyId: store.agencyId,
      actorId: user.id,
      actorName: user.name,
      entity: "store",
      entityId: storeId,
      meta: {
        languages: languages.join(","),
        defaultLanguage,
        previousLanguages: before.locales.join(","),
        previousDefaultLanguage: before.defaultLocale,
      },
    });
  }
  revalidatePath(`/app/stores/${storeId}/setup`);
  // The languages decide every storefront and gift portal address and its copy.
  revalidatePath(`/s/${store.slug}`, "layout");
  revalidatePath("/g", "layout");
  return ok(t("languagesSaved"));
}

/** "German" for "de". The audit history is written in English. */
function englishName(code: string): string {
  return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
}

export async function saveLocalisation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const { user, store } = await assertStoreAccess(storeId, "store.settings");
  const t = await getTranslations("actions.stores");

  const currencies = formData.getAll("currencies").map(String);
  const defaultCurrency = String(formData.get("defaultCurrency") ?? "");

  if (currencies.length === 0) return fail(t("currencyRequired"), "currencies");
  if (!currencies.includes(defaultCurrency)) {
    return fail(t("defaultCurrencyRequired"), "defaultCurrency");
  }

  await updateStore(storeId, {
    currencies,
    defaultCurrency,
    setup: { ...store.setup, localisation: true },
  });
  recordAudit({
    category: "store_setup",
    action: "store.localisation_updated",
    summary: `Set the selling currencies to ${currencies.join(", ")} (default ${defaultCurrency})`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "store",
    entityId: storeId,
    meta: { defaultCurrency },
  });
  revalidatePath(`/app/stores/${storeId}/setup`);
  // The currencies decide the storefront's prices, so every page of it is
  // stale once this saves.
  revalidatePath(`/s/${store.slug}`, "layout");
  return ok(t("localisationSaved"));
}

/**
 * The support contacts a shopper is given on the order status page and in the
 * storefront footer. The address is required — it is the only working route
 * from a shopper with a problem back to the seller — and the phone number is
 * offered as well for stores that answer one.
 */
export async function saveSupport(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const { user, store } = await assertStoreAccess(storeId, "store.settings");
  const t = await getTranslations("actions.stores");

  const supportEmail = String(formData.get("supportEmail") ?? "").trim().toLowerCase();
  const supportPhone = String(formData.get("supportPhone") ?? "").trim();

  if (!supportEmail) {
    return fail(t("supportEmailRequired"), "supportEmail");
  }
  if (!isSupportEmail(supportEmail)) {
    return fail(t("supportEmailInvalid"), "supportEmail");
  }
  if (supportPhone && !isSupportPhone(supportPhone)) {
    return fail(t("supportPhoneInvalid"), "supportPhone");
  }

  await updateStore(storeId, {
    supportEmail,
    supportPhone: supportPhone || null,
    setup: { ...store.setup, support: true },
  });
  recordAudit({
    category: "store_setup",
    action: "store.support_updated",
    summary: `Shopper support set to ${supportEmail}${supportPhone ? ` and ${supportPhone}` : ""}`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "store",
    entityId: storeId,
    meta: { supportEmail, supportPhone: supportPhone || null },
  });
  revalidatePath(`/app/stores/${storeId}/setup`);
  // The footer carries the contacts, so every storefront page is stale.
  revalidatePath(`/s/${store.slug}`, "layout");
  return ok(
    supportPhone
      ? t("supportBothSaved")
      : t("supportEmailSaved"),
  );
}

/**
 * Saves the store's policies in one language. A policy left empty, or matching
 * what shoppers would read without it, is not stored, so the store keeps
 * following the default text.
 */
export async function savePolicies(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const { user, store } = await assertStoreAccess(storeId, "store.settings");
  const t = await getTranslations("actions.stores");

  const { locales, defaultLocale } = storeLanguages(store);
  const language = String(formData.get("language") ?? "");
  if (!isLocale(language) || !locales.includes(language)) {
    return fail(t("policyLanguageInvalid"), "language");
  }

  const builtIn = await getTranslations({ locale: language, namespace: "storePolicies" });
  const own: Partial<Record<(typeof POLICY_KEYS)[number], string>> = {};
  for (const key of POLICY_KEYS) {
    const text = normalizePolicy(String(formData.get(key) ?? ""));
    if (text.length > POLICY_MAX_LENGTH) {
      return fail(t("policyTooLong", { max: POLICY_MAX_LENGTH }), key);
    }
    const fallback =
      (language !== defaultLocale ? store.policies?.[defaultLocale]?.[key] : null) ||
      builtIn(key, { store: store.name });
    if (text && text !== normalizePolicy(fallback)) own[key] = text;
  }

  const policies: StorePolicies = { ...(store.policies ?? {}), [language]: own };
  await updateStore(storeId, { policies });
  recordAudit({
    category: "store_setup",
    action: "store.policies_updated",
    summary: `Store policies updated (${language})`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "store",
    entityId: storeId,
    meta: { language, edited: Object.keys(own).join(", ") },
  });
  revalidatePath(`/app/stores/${storeId}/setup`);
  revalidatePath(`/s/${store.slug}`, "layout");
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

export async function saveStripe(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const { user, store } = await assertStoreAccess(storeId, "store.settings");
  const t = await getTranslations("actions.stores");

  const intent = String(formData.get("intent") ?? "connect");
  if (intent === "disconnect") {
    await updateStore(storeId, {
      stripe: { connected: false, accountId: null, country: store.stripe.country, chargesEnabled: false, connectedAt: null },
      setup: { ...store.setup, payments: false },
    });
    recordAudit({
      category: "store_setup",
      action: "store.stripe_disconnected",
      summary: "Disconnected the Stripe account",
      storeId,
      agencyId: store.agencyId,
      actorId: user.id,
      actorName: user.name,
      entity: "store",
      entityId: storeId,
      meta: {},
    });
    revalidatePath(`/app/stores/${storeId}/setup`);
    return ok(t("stripeDisconnected"));
  }

  const accountId = String(formData.get("accountId") ?? "").trim();
  const country = String(formData.get("country") ?? "US");
  if (!/^acct_[A-Za-z0-9]{6,}$/.test(accountId)) {
    return fail(t("stripeInvalid"), "accountId");
  }

  await updateStore(storeId, {
    stripe: {
      connected: true,
      accountId,
      country,
      chargesEnabled: true,
      connectedAt: new Date().toISOString(),
    },
    setup: { ...store.setup, payments: true },
  });
  recordAudit({
    category: "store_setup",
    action: "store.stripe_connected",
    summary: `Connected Stripe account ${accountId} (${country})`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "store",
    entityId: storeId,
    meta: { accountId, country },
  });
  revalidatePath(`/app/stores/${storeId}/setup`);
  return ok(t("stripeConnected", { account: accountId }));
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

export async function disconnectStripe(formData: FormData): Promise<void> {
  await saveStripe({ status: "idle" }, formData);
}

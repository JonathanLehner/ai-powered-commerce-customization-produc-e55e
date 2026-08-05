"use server";

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
import { languageLabel, resolveLanguage } from "@/lib/i18n";
import { db } from "@/lib/platform";
import { storeAllowance, storeLimitMessage } from "@/lib/plans";
import { assertStoreAccess, getSessionUser } from "@/lib/session";
import { treeFromSections } from "@/lib/storefront-schema";
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
  if (!user) return fail("You are signed out. Sign in again to continue.");
  if (user.platformRole !== "agency_admin" && user.platformRole !== "platform_admin") {
    return fail("Only agency administrators can create stores.");
  }
  const agencyId = user.agencyId ?? String(formData.get("agencyId") ?? "");
  if (!agencyId) return fail("Choose the agency this store belongs to.", "agencyId");

  // The plan is checked before anything else: the create screen already refuses
  // at the limit, so reaching here means a stale tab or a second submission that
  // would have taken the agency past what it pays for.
  const [agency, activeStores] = await Promise.all([
    getAgency(agencyId),
    countActiveStoresForAgency(agencyId),
  ]);
  if (!agency) return fail("That agency no longer exists. Ask the platform administrator.", "agencyId");
  const allowance = storeAllowance(agency.plan, activeStores);
  if (allowance.atLimit) return fail(storeLimitMessage(allowance, agency.name));

  const name = String(formData.get("name") ?? "").trim();
  const clientName = String(formData.get("clientName") ?? "").trim();
  const defaultCurrency = String(formData.get("defaultCurrency") ?? "USD");
  // Only a language the storefront can actually be rendered in is stored.
  const defaultLanguage = resolveLanguage(String(formData.get("defaultLanguage") ?? ""));
  const theme = String(formData.get("theme") ?? "atelier") as ThemeKey;

  if (name.length < 3) return fail("Give the store a name of at least 3 characters.", "name");
  if (!clientName) return fail("Enter the client this store is for.", "clientName");

  let slug = slugify(name);
  if (!slug) return fail("That name cannot be turned into a web address. Use letters or numbers.", "name");
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
    currencies: [defaultCurrency],
    defaultCurrency,
    customDomain: null,
    domainStatus: "unset",
    stripe: { connected: false, accountId: null, country: "US", chargesEnabled: false, connectedAt: null },
    carriers: [
      { carrier: "dhl", enabled: false, accountNumber: "", services: ["Express Worldwide", "Economy Select"] },
      { carrier: "fedex", enabled: false, accountNumber: "", services: ["International Priority", "International Economy"] },
      { carrier: "ups", enabled: false, accountNumber: "", services: ["Worldwide Expedited", "Standard"] },
    ],
    defaultTaxBracketId: null,
    pricesIncludeTax: false,
    setup: { branding: false, localisation: true, domain: false, payments: false, shipping: false, tax: false },
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
  if (name.length < 3) return fail("Give the store a name of at least 3 characters.", "name");
  if (!clientName) return fail("Enter the client this store is for.", "clientName");

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
  return ok("Store name updated.");
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
        ? `Archived store “${store.name}” — its storefront is now offline`
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
    summary: `Updated branding — theme “${theme}”${logoUrl !== store.logoUrl ? " and a new logo" : ""}`,
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
  return ok(logoUrl !== store.logoUrl ? "Logo uploaded and theme saved." : "Theme saved.");
}

export async function saveLocalisation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const { user, store } = await assertStoreAccess(storeId, "store.settings");

  const defaultLanguage = resolveLanguage(
    String(formData.get("defaultLanguage") ?? store.defaultLanguage),
  );
  const currencies = formData.getAll("currencies").map(String);
  const defaultCurrency = String(formData.get("defaultCurrency") ?? "");

  if (currencies.length === 0) return fail("Select at least one selling currency.", "currencies");
  if (!currencies.includes(defaultCurrency)) {
    return fail("The default currency must be one of the selected selling currencies.", "defaultCurrency");
  }

  await updateStore(storeId, {
    defaultLanguage,
    currencies,
    defaultCurrency,
    setup: { ...store.setup, localisation: true },
  });
  recordAudit({
    category: "store_setup",
    action: "store.localisation_updated",
    summary: `Set the storefront language to ${languageLabel(defaultLanguage)} and selling currencies to ${currencies.join(", ")} (default ${defaultCurrency})`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "store",
    entityId: storeId,
    meta: { defaultCurrency, defaultLanguage },
  });
  revalidatePath(`/app/stores/${storeId}/setup`);
  // The language decides the storefront's own copy and formatting, so every
  // page of it is stale once this saves.
  revalidatePath(`/s/${store.slug}`, "layout");
  return ok("Language and currencies saved.");
}

export async function saveDomain(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const { user, store } = await assertStoreAccess(storeId, "store.settings");

  const raw = String(formData.get("customDomain") ?? "").trim().toLowerCase();
  const verify = formData.get("intent") === "verify";

  if (!raw) {
    await updateStore(storeId, {
      customDomain: null,
      domainStatus: "unset",
      setup: { ...store.setup, domain: false },
    });
    revalidatePath(`/app/stores/${storeId}/setup`);
    return ok("Custom domain removed. The store is served from its Parcelith address.");
  }

  const domain = raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
    return fail("Enter a domain like shop.yourclient.com — no protocol, no path.", "customDomain");
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
      ? `${domain} is verified and now serves this storefront.`
      : `${domain} saved. Add the CNAME record below, then run verification.`,
  );
}

export async function saveStripe(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const { user, store } = await assertStoreAccess(storeId, "store.settings");

  const intent = String(formData.get("intent") ?? "connect");
  if (intent === "disconnect") {
    await updateStore(storeId, {
      stripe: { connected: false, accountId: null, country: store.stripe.country, chargesEnabled: false, connectedAt: null },
      setup: { ...store.setup, payments: false },
    });
    recordAudit({
      category: "store_setup",
      action: "store.stripe_disconnected",
      summary: "Disconnected the Stripe account — checkout is now unavailable",
      storeId,
      agencyId: store.agencyId,
      actorId: user.id,
      actorName: user.name,
      entity: "store",
      entityId: storeId,
      meta: {},
    });
    revalidatePath(`/app/stores/${storeId}/setup`);
    return ok("Stripe disconnected. This store cannot take payments until it is reconnected.");
  }

  const accountId = String(formData.get("accountId") ?? "").trim();
  const country = String(formData.get("country") ?? "US");
  if (!/^acct_[A-Za-z0-9]{6,}$/.test(accountId)) {
    return fail("Stripe account IDs look like acct_1A2b3C4d5E6f. Copy it from the client's Stripe dashboard.", "accountId");
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
  return ok(`${accountId} connected. Charges settle directly into the client's account.`);
}

export async function saveCarriers(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const { user, store } = await assertStoreAccess(storeId, "store.settings");

  const carriers = store.carriers.map((c) => {
    const enabled = formData.get(`${c.carrier}_enabled`) === "on";
    const accountNumber = String(formData.get(`${c.carrier}_account`) ?? "").trim();
    return { ...c, enabled, accountNumber };
  });

  const missing = carriers.find((c) => c.enabled && !c.accountNumber);
  if (missing) {
    return fail(
      `Add the account number for ${missing.carrier.toUpperCase()}, or turn the carrier off.`,
      `${missing.carrier}_account`,
    );
  }
  if (!carriers.some((c) => c.enabled)) {
    return fail("Enable at least one carrier so paid orders can be dispatched.", "dhl_enabled");
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
  return ok("Carrier settings saved.");
}

export async function saveTaxSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const { user, store } = await assertStoreAccess(storeId, "store.settings");

  const defaultTaxBracketId = String(formData.get("defaultTaxBracketId") ?? "");
  const pricesIncludeTax = formData.get("pricesIncludeTax") === "on";
  if (!defaultTaxBracketId) return fail("Choose the default tax bracket for this store.", "defaultTaxBracketId");

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
  return ok("Tax configuration saved.");
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

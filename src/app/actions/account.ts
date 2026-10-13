"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { shopperSignIn, shopperSignOut } from "@/shopper-auth";
import { DEFAULT_LOCALE } from "@/i18n/locales";
import { publicStoreRoot, shopperLocale, shopperTranslator } from "@/i18n/storefront";
import { localeBase, storeLanguages } from "@/i18n/storefront-routing";
import { cleanAddress, withAddress, withoutAddress, type AddressProblem } from "@/lib/account-rules";
import { getShopperAccount, linkCustomerAccount, saveAddressBook, saveMarketingConsent } from "@/lib/accounts";
import { getStore } from "@/lib/data";
import type { Store } from "@/lib/types";
import { newId } from "@/lib/util";
import type { ActionState } from "./stores";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** The shopper copy in the language the action was posted from, and the store's address in it. */
async function copyFor(store: Store | null) {
  const locale = store ? shopperLocale(store, await getLocale()) : DEFAULT_LOCALE;
  const t = store ? await shopperTranslator(store, locale) : await getTranslations({ locale, namespace: "storefront" });
  const base = store ? localeBase(await publicStoreRoot(store.slug), locale, storeLanguages(store).defaultLocale) : "";
  return { locale, t, base };
}

/**
 * Emails a sign-in link through Auth.js's Email provider. The answer is the
 * same whether or not the address has ordered before, so the form cannot be
 * used to find out who shops here.
 */
export async function requestSignInLink(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const store = await getStore(String(formData.get("storeId") ?? ""));
  const { locale, t } = await copyFor(store);
  if (!store || store.status !== "active") return { status: "error", message: t("actions.storeClosed") };
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL.test(email)) return { status: "error", message: t("account.enterEmail"), field: "email" };
  try {
    await shopperSignIn("email", { email, redirectTo: `/s/${store.slug}/${locale}/account`, redirect: false });
  } catch (error) {
    console.error("Sign-in link could not be sent", error);
    return { status: "error", message: t("account.linkFailed") };
  }
  return { status: "success", message: t("account.linkSent", { email }) };
}

export async function signOutShopper(formData: FormData): Promise<void> {
  const store = await getStore(String(formData.get("storeId") ?? ""));
  const { base } = await copyFor(store);
  await shopperSignOut({ redirect: false });
  redirect(base || "/");
}

/** The signed-in shopper and their linked record in the store the form was posted from. */
async function signedIn(formData: FormData) {
  const store = await getStore(String(formData.get("storeId") ?? ""));
  const copy = await copyFor(store);
  const account = await getShopperAccount();
  if (!store || !account) return { ...copy, store: null, account: null, customer: null };
  const customer = await linkCustomerAccount(store, account);
  return { ...copy, store, account, customer };
}

const ADDRESS_MESSAGES: Record<AddressProblem, string> = {
  name: "actions.enterName",
  line1: "actions.enterStreet",
  city: "actions.enterCity",
  postalCode: "actions.enterPostalCode",
  country: "actions.chooseCountry",
  region: "actions.enterRegion",
  phone: "actions.enterPhone",
  tooMany: "account.tooManyAddresses",
};

export async function saveAddress(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { t, store, account, customer, base } = await signedIn(formData);
  if (!store || !account || !customer) return { status: "error", message: t("account.signedOut") };
  const cleaned = cleanAddress(Object.fromEntries(formData.entries()));
  if ("problem" in cleaned) {
    return { status: "error", message: t(ADDRESS_MESSAGES[cleaned.problem] as "actions.enterName"), field: cleaned.problem };
  }
  // The form names its address, so a resubmitted save edits it rather than adding a copy.
  const rawId = String(formData.get("addressId") ?? "");
  const id = /^adr_[a-z0-9]{12}$/.test(rawId) ? rawId : newId("adr");
  const book = withAddress(customer.addresses ?? [], { ...cleaned.address, id }, formData.get("isDefault") !== null);
  if (!book) return { status: "error", message: t("account.tooManyAddresses") };
  if (!(await saveAddressBook(store.id, account, book))) return { status: "error", message: t("account.signedOut") };
  revalidatePath(`${base}/account`);
  return { status: "success", message: t("account.addressSaved") };
}

export async function deleteAddress(formData: FormData): Promise<void> {
  const { store, account, customer, base } = await signedIn(formData);
  if (!store || !account || !customer) return;
  await saveAddressBook(store.id, account, withoutAddress(customer.addresses ?? [], String(formData.get("addressId") ?? "")));
  revalidatePath(`${base}/account`);
}

export async function setMarketing(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { t, store, account, base } = await signedIn(formData);
  if (!store || !account) return { status: "error", message: t("account.signedOut") };
  const subscribed = formData.get("subscribed") !== null;
  if (!(await saveMarketingConsent(store, account, subscribed))) return { status: "error", message: t("account.signedOut") };
  revalidatePath(`${base}/account`);
  return { status: "success", message: subscribed ? t("account.subscribed") : t("account.unsubscribed") };
}

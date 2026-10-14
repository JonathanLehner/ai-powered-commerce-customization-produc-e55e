"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { shopperSignOut } from "@/shopper-auth";
import { DEFAULT_LOCALE } from "@/i18n/locales";
import { publicStoreRoot, shopperLocale, shopperTranslator } from "@/i18n/storefront";
import { localeBase, storeLanguages } from "@/i18n/storefront-routing";
import { getShopperAccount } from "@/lib/accounts";
import { getStore } from "@/lib/data";
import type { ShopRefusal } from "@/lib/operations/shop";
import {
  deleteAddress as removeAddress,
  requestSignInLink as sendSignInLink,
  saveAddress as storeAddress,
  setMarketing as storeMarketing,
  signedInShopper,
} from "@/lib/operations/shopper-account";
import type { Store } from "@/lib/types";
import type { ActionState } from "./stores";

/** The shopper copy in the language the action was posted from, and the store's address in it. */
async function copyFor(store: Store | null) {
  const locale = store ? shopperLocale(store, await getLocale()) : DEFAULT_LOCALE;
  const t = store ? await shopperTranslator(store, locale) : await getTranslations({ locale, namespace: "storefront" });
  const base = store ? localeBase(await publicStoreRoot(store.slug), locale, storeLanguages(store).defaultLocale) : "";
  return { locale, t, base };
}

function refusal({ message, field }: ShopRefusal): ActionState {
  return { status: "error", message, ...(field ? { field } : {}) };
}

/**
 * Emails a sign-in link through Auth.js's Email provider. The answer is the
 * same whether or not the address has ordered before, so the form cannot be
 * used to find out who shops here.
 */
export async function requestSignInLink(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const store = await getStore(String(formData.get("storeId") ?? ""));
  const result = await sendSignInLink(store, await copyFor(store), String(formData.get("email") ?? ""));
  return result.status === "error" ? refusal(result) : result;
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
  const shopper = await signedInShopper(store, await getShopperAccount());
  return { ...copy, shopper };
}

export async function saveAddress(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { t, shopper, base } = await signedIn(formData);
  const result = await storeAddress(
    shopper,
    t,
    Object.fromEntries(formData.entries()),
    String(formData.get("addressId") ?? ""),
    formData.get("isDefault") !== null,
  );
  if (result.status === "error") return refusal(result);
  revalidatePath(`${base}/account`);
  return { status: "success", message: result.message };
}

export async function deleteAddress(formData: FormData): Promise<void> {
  const { shopper, base } = await signedIn(formData);
  if (await removeAddress(shopper, String(formData.get("addressId") ?? ""))) revalidatePath(`${base}/account`);
}

export async function setMarketing(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { t, shopper, base } = await signedIn(formData);
  const result = await storeMarketing(shopper, t, formData.get("subscribed") !== null);
  if (result.status === "error") return refusal(result);
  revalidatePath(`${base}/account`);
  return result;
}

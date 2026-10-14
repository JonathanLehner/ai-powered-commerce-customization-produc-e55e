import "server-only";
import { decode } from "next-auth/jwt";
import type { Locale } from "@/i18n/locales";
import { shopperSignIn } from "@/shopper-auth";
import { cleanAddress, withAddress, withoutAddress, type AddressProblem } from "../account-rules";
import { linkCustomerAccount, saveAddressBook, saveMarketingConsent, type ShopperAccount } from "../account-data";
import { customerKey } from "../customers";
import type { Customer, Store } from "../types";
import { newId } from "../util";
import type { ShopDone, ShopRefusal, StorefrontTranslator } from "./shop";

/**
 * A shopper's own account in a store: the emailed sign-in link, the address
 * book and the marketing choice. The storefront's account actions and the
 * Storefront API run these; the actions know the shopper from the session
 * cookie, the API from the same session token passed as `customerAccessToken`.
 */

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** The shopper session cookie's name, which Auth.js also uses as the token's salt. */
export const SHOPPER_SESSION_COOKIE = "parcelith-shopper.session-token";

function refuse(message: string, field?: string, code?: ShopRefusal["code"]): ShopRefusal {
  return { status: "error", message, ...(field ? { field } : {}), ...(code ? { code } : {}) };
}

/**
 * The shopper a session token belongs to, or null for a token that is not one,
 * has expired or was made with another secret. Decoded by Auth.js itself.
 */
export async function shopperFromToken(token: string): Promise<ShopperAccount | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret || !token) return null;
  try {
    const payload = await decode({ token, secret, salt: SHOPPER_SESSION_COOKIE });
    const email = typeof payload?.email === "string" ? payload.email : null;
    const userId = typeof payload?.sub === "string" ? payload.sub : null;
    return email && userId ? { userId, email: customerKey(email) } : null;
  } catch {
    return null;
  }
}

/** The signed-in shopper with their customer record in the store, linked on first use. */
export interface SignedInShopper {
  store: Store;
  account: ShopperAccount;
  customer: Customer;
}

export async function signedInShopper(store: Store | null, account: ShopperAccount | null): Promise<SignedInShopper | null> {
  if (!store || !account) return null;
  return { store, account, customer: await linkCustomerAccount(store, account) };
}

/**
 * Emails a sign-in link through Auth.js's Email provider. The answer is the
 * same whether or not the address has ordered before, so it cannot be used to
 * find out who shops here.
 */
export async function requestSignInLink(
  store: Store | null,
  copy: { locale: Locale; t: StorefrontTranslator },
  rawEmail: string,
): Promise<ShopRefusal | ShopDone> {
  const { locale, t } = copy;
  if (!store || store.status !== "active") return refuse(t("actions.storeClosed"), undefined, "conflict");
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL.test(email)) return refuse(t("account.enterEmail"), "email");
  try {
    await shopperSignIn("email", { email, redirectTo: `/s/${store.slug}/${locale}/account`, redirect: false });
  } catch (error) {
    console.error("Sign-in link could not be sent", error);
    return refuse(t("account.linkFailed"));
  }
  return { status: "success", message: t("account.linkSent", { email }) };
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

/**
 * Adds an address to the book, or replaces the one with `addressId`. The caller
 * names a new address, so a resubmitted save edits it rather than adding a copy.
 */
export async function saveAddress(
  shopper: SignedInShopper | null,
  t: StorefrontTranslator,
  raw: Record<string, unknown>,
  addressId: string,
  makeDefault: boolean,
): Promise<ShopRefusal | (ShopDone & { addressId: string })> {
  if (!shopper) return refuse(t("account.signedOut"), undefined, "conflict");
  const { store, account, customer } = shopper;
  const cleaned = cleanAddress(raw);
  if ("problem" in cleaned) {
    return refuse(t(ADDRESS_MESSAGES[cleaned.problem] as "actions.enterName"), cleaned.problem);
  }
  const id = /^adr_[a-z0-9]{12}$/.test(addressId) ? addressId : newId("adr");
  const book = withAddress(customer.addresses ?? [], { ...cleaned.address, id }, makeDefault);
  if (!book) return refuse(t("account.tooManyAddresses"), undefined, "conflict");
  if (!(await saveAddressBook(store.id, account, book))) return refuse(t("account.signedOut"), undefined, "conflict");
  return { status: "success", message: t("account.addressSaved"), addressId: id };
}

/** Takes an address out of the book. An address not in it changes nothing. */
export async function deleteAddress(shopper: SignedInShopper | null, addressId: string): Promise<boolean> {
  if (!shopper) return false;
  const { store, account, customer } = shopper;
  await saveAddressBook(store.id, account, withoutAddress(customer.addresses ?? [], addressId));
  return true;
}

export async function setMarketing(
  shopper: SignedInShopper | null,
  t: StorefrontTranslator,
  subscribed: boolean,
): Promise<ShopRefusal | ShopDone> {
  if (!shopper) return refuse(t("account.signedOut"), undefined, "conflict");
  if (!(await saveMarketingConsent(shopper.store, shopper.account, subscribed))) {
    return refuse(t("account.signedOut"), undefined, "conflict");
  }
  return { status: "success", message: subscribed ? t("account.subscribed") : t("account.unsubscribed") };
}

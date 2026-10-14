"use server";

import { cookies, headers } from "next/headers";
import { shopperCurrency } from "@/lib/currency";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { getStore, getStoreBySlug } from "@/lib/data";
import { DEFAULT_LOCALE } from "@/i18n/locales";
import { publicStoreRoot, shopperLocale, shopperTranslator } from "@/i18n/storefront";
import { localeBase, storeLanguages } from "@/i18n/storefront-routing";
import type { BasketSheetLine } from "@/lib/basket";
import {
  addCartLine,
  applyDiscount as applyCartDiscount,
  applyGiftCard as applyCartGiftCard,
  attachLinePreview as attachCartLinePreview,
  lookupOrder as findOrderForShopper,
  openCart,
  placeOrder as placeShopperOrder,
  readPlacement,
  removeCartLine,
  removeDiscount as removeCartDiscount,
  removeGiftCard as removeCartGiftCard,
  updateCartLine,
  type ShopRefusal,
  type ShopperSession,
} from "@/lib/operations/shop";
import { readStoredImage } from "@/lib/uploads";
import { SHOPPER_COOKIE } from "@/lib/session";
import type { Cart, Store } from "@/lib/types";
import { newId } from "@/lib/util";
import type { ActionState } from "./stores";

/**
 * The storefront's basket, checkout and order lookup. Each action reads the
 * shopper's cookie and the form, runs the shared operation in
 * `@/lib/operations/shop` (which the Storefront API runs too), and redirects or
 * refreshes the page as the answer says.
 */

const CURRENCY_COOKIE = "cc_currency";

async function sessionId(create: boolean): Promise<string | null> {
  const jar = await cookies();
  const existing = jar.get(SHOPPER_COOKIE)?.value;
  if (existing) return existing;
  if (!create) return null;
  const id = newId("shp");
  jar.set(SHOPPER_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === "production",
  });
  return id;
}

export async function readShopperSession(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SHOPPER_COOKIE)?.value ?? null;
}

/**
 * The shopper's currency: the one they picked in the header, else their
 * country's (from Cloudflare's visitor country) when the store sells in it,
 * else the shop currency.
 */
export async function readCurrency(fallback: string, allowed: string[]): Promise<string> {
  const [jar, list] = await Promise.all([cookies(), headers()]);
  return shopperCurrency({
    chosen: jar.get(CURRENCY_COOKIE)?.value,
    country: list.get("cf-ipcountry"),
    enabled: allowed,
    fallback,
  });
}

/**
 * Remembers the shopper's display currency. The header picker calls this in
 * place: setting the cookie re-renders the page the shopper is on, so its path,
 * search and the variant they picked are kept. The no-JavaScript form is a full
 * post, so it is sent back to the page it came from.
 */
export async function setCurrency(formData: FormData): Promise<void> {
  const currency = String(formData.get("currency") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const back = (await refererPath()) ?? String(formData.get("back") ?? `/s/${slug}`);
  const store = await getStore(String(formData.get("storeId") ?? ""));
  if (store && store.currencies.includes(currency)) {
    const jar = await cookies();
    jar.set(CURRENCY_COOKIE, currency, {
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      secure: process.env.NODE_ENV === "production",
    });
  }
  if (formData.get("inPlace") === "1") return;
  redirect(back);
}

/** The path and search of the page that posted, when it is on this site. */
async function refererPath(): Promise<string | null> {
  const list = await headers();
  const referer = list.get("referer");
  if (!referer) return null;
  try {
    const url = new URL(referer);
    if (url.host !== list.get("host")) return null;
    return url.pathname + url.search;
  } catch {
    return null;
  }
}

async function loadCart(storeId: string, create: boolean): Promise<Cart | null> {
  const session = await sessionId(create);
  if (!session) return null;
  return openCart(storeId, session, create);
}

function refreshBasket(slug: string) {
  revalidatePath(`/s/${slug}`, "layout");
}

/**
 * The shopper copy in the language the action was posted from, which the proxy
 * names on every storefront request, held to the languages the store has
 * enabled. `base` is the storefront's address in that language.
 */
async function shopperCopy(store: Store | null) {
  const locale = store ? shopperLocale(store, await getLocale()) : DEFAULT_LOCALE;
  const [t, format] = await Promise.all([
    store ? shopperTranslator(store, locale) : getTranslations({ locale, namespace: "storefront" }),
    getFormatter({ locale }),
  ]);
  const base = store ? localeBase(await publicStoreRoot(store.slug), locale, storeLanguages(store).defaultLocale) : "";
  return { locale, t, format, base };
}

/** The browser's side of the shared shop operations: its cookie basket, language and currency. */
const browser: ShopperSession = {
  cart: loadCart,
  copy: shopperCopy,
  currency: (store) => readCurrency(store.defaultCurrency, store.currencies),
  basketChanged: (store) => refreshBasket(store.slug),
};

/** A refusal as the form shows it. */
function refusal({ message, field }: ShopRefusal): ActionState {
  return { status: "error", message, ...(field ? { field } : {}) };
}

/* -------------------------------------------------------------- add to cart */

/** The add's answer, with the basket as saved so the header can show it straight away. */
export interface AddToCartState extends ActionState {
  basket?: { lines: BasketSheetLine[]; subtotal: number };
  /** The line just added, at the quantity added, for the confirmation beside the button. */
  added?: BasketSheetLine & { artworkFileName: string | null };
}

export async function addToCart(_prev: AddToCartState, formData: FormData): Promise<AddToCartState> {
  const result = await addCartLine(browser, {
    storeId: String(formData.get("storeId") ?? ""),
    productId: String(formData.get("productId") ?? ""),
    variantId: String(formData.get("variantId") ?? ""),
    quantity: Math.max(1, Math.min(50, Number(formData.get("quantity") ?? 1) || 1)),
    text: String(formData.get("text") ?? "").trim(),
    // The product page names the line before it posts, so a resubmission of the
    // same add finds it already stored.
    lineId: String(formData.get("lineId") ?? ""),
    // The file itself went to /api/uploads before the form was submitted, so only
    // its stored URL and metadata arrive here.
    artwork: readStoredImage(formData, "artwork", "shopperArtwork"),
    placement: readPlacement((key) => formData.get(key)),
    preview: readStoredImage(formData, "preview", "shopperPreview"),
  });
  if (result.status === "error") return refusal(result);
  return { status: "success", message: result.message, basket: result.basket, added: result.added };
}

/**
 * Puts the composited preview on a personalised line once the product page has
 * drawn and stored it. Until then the line shows the photo with the
 * personalisation drawn over it.
 */
export async function attachLinePreview(formData: FormData): Promise<void> {
  await attachCartLinePreview(
    browser,
    String(formData.get("storeId") ?? ""),
    String(formData.get("itemId") ?? ""),
    readStoredImage(formData, "preview", "shopperPreview"),
  );
}

export async function updateCartItem(formData: FormData): Promise<void> {
  await updateCartLine(
    browser,
    String(formData.get("storeId") ?? ""),
    String(formData.get("itemId") ?? ""),
    Number(formData.get("quantity") ?? 1),
  );
}

export async function removeCartItem(formData: FormData): Promise<void> {
  await removeCartLine(browser, String(formData.get("storeId") ?? ""), String(formData.get("itemId") ?? ""));
}

/* ------------------------------------------------------- discount codes */

export async function applyDiscount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = await applyCartDiscount(browser, String(formData.get("storeId") ?? ""), String(formData.get("code") ?? ""));
  return result.status === "error" ? refusal(result) : result;
}

export async function removeDiscount(formData: FormData): Promise<void> {
  await removeCartDiscount(browser, String(formData.get("storeId") ?? ""));
}

/* ------------------------------------------------------------- gift cards */

export async function applyGiftCard(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = await applyCartGiftCard(browser, String(formData.get("storeId") ?? ""), String(formData.get("code") ?? ""));
  return result.status === "error" ? refusal(result) : result;
}

export async function removeGiftCard(formData: FormData): Promise<void> {
  await removeCartGiftCard(browser, String(formData.get("storeId") ?? ""));
}

/* ------------------------------------------------------------------ checkout */

export async function placeOrder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const field = (name: string) => String(formData.get(name) ?? "");
  const currency = formData.get("currency");
  const result = await placeShopperOrder(browser, {
    storeId: field("storeId"),
    idempotencyKey: field("idempotencyKey"),
    name: field("name"),
    email: field("email"),
    line1: field("line1"),
    line2: field("line2"),
    city: field("city"),
    postalCode: field("postalCode"),
    country: field("country"),
    region: field("region"),
    phone: field("phone"),
    currency: currency === null ? null : String(currency),
    shippingRate: field("shippingRate"),
    marketingConsent: formData.get("marketingConsent") === "on",
    cardNumber: field("cardNumber"),
    expiry: field("expiry"),
    cvc: field("cvc"),
  });
  if (result.status === "error") return refusal(result);
  redirect(result.to);
}

/* -------------------------------------------------------------- order status */

/**
 * Opens the order status page for a shopper who can state the order code and
 * the email address on the order. The failure message is deliberately identical
 * for an unknown code and a mismatched email so the form cannot be used to
 * discover which order codes exist.
 */
export async function lookupOrder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const store = await getStoreBySlug(String(formData.get("slug") ?? ""));
  const result = await findOrderForShopper(
    store,
    await shopperCopy(store),
    String(formData.get("code") ?? ""),
    String(formData.get("email") ?? ""),
  );
  if (result.status === "error") return refusal(result);
  redirect(result.to);
}

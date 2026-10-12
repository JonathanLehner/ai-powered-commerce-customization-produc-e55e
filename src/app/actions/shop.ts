"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import {
  issueSentence,
  shopperArtworkIssues,
  shopperBlockingIssues,
} from "@/lib/artwork-shopper";
import {
  COLLECTIONS,
  claimDiscountUse,
  getCart,
  getCatalogProduct,
  getDiscountCodeByCode,
  getOrderByCode,
  getOrderByIdempotencyKey,
  getStore,
  getStoreBySlug,
  getStoreProduct,
  listShippingZones,
  releaseDiscountUse,
  updateOrder,
} from "@/lib/data";
import { siteOrigin } from "@/lib/email";
import { addressRegionKind, localCountryName } from "@/lib/countries";
import { EMAIL_DELIVERY_RATE_ID, stripeAllowedCountries, zoneFor } from "@/lib/shipping";
import { getGiftCardByCode, holdGiftCard, releaseGiftCardHold } from "@/lib/gift-card-data";
import { basketGiftCardCover, giftCardRefusal, looksLikeGiftCode } from "@/lib/gift-cards";
import { formatMinorUnits } from "@/i18n/format";
import { DEFAULT_LOCALE } from "@/i18n/locales";
import { shopperLocale, shopperTranslator } from "@/i18n/storefront";
import { localizeProduct } from "@/lib/translations";
import { localeBase, storeLanguages } from "@/i18n/storefront-routing";
import { emailMatchesOrder, orderStatusUrl, signOrderToken } from "@/lib/order-access";
import { isLive } from "@/lib/artwork";
import { basketTotals, cartDiscountCode } from "@/lib/basket";
import { checkDiscount, normalizeDiscountCode } from "@/lib/discounts";
import { personalisationTextColour, variantPhoto } from "@/lib/line-preview";
import { readStoredImage } from "@/lib/uploads";
import { db } from "@/lib/mongo";
import { SHOPPER_COOKIE } from "@/lib/session";
import { chargeCard } from "@/lib/demo-payment";
import { abandonOrderPayment, confirmOrderPayment } from "@/lib/order-payment";
import { getLevel, releaseLines, reserveStock } from "@/lib/inventory";
import { availableOf, canSell } from "@/lib/inventory-rules";
import { paymentMode } from "@/lib/payment-mode";
import { createConnectedCheckout, expireConnectedCheckout } from "@/lib/stripe";
import {
  DEFAULT_PLACEMENT,
  type Artwork,
  type ArtworkPlacement,
  type Cart,
  type CartItem,
  type Order,
  type PreviewOverlay,
  type Store,
} from "@/lib/types";
import { formatMoney, newId, orderCode } from "@/lib/util";
import type { ActionState } from "./stores";

/**
 * Placement the shopper set on the product page. Clamped to the same range the
 * configurator allows, because the values arrive on a form and nothing stops a
 * browser sending a scale of 900.
 */
function readPlacement(formData: FormData): ArtworkPlacement {
  const read = (key: string, fallback: number, min: number, max: number) => {
    const raw = formData.get(key);
    // A missing field is a submission from before placement existed, not a
    // zero: those keep the centred default rather than jumping to a corner.
    if (typeof raw !== "string" || raw.trim() === "") return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  };
  return {
    x: read("artworkX", DEFAULT_PLACEMENT.x, -0.5, 1.5),
    y: read("artworkY", DEFAULT_PLACEMENT.y, -0.5, 1.5),
    scale: read("artworkScale", DEFAULT_PLACEMENT.scale, 0.05, 2),
    rotation: read("artworkRotation", DEFAULT_PLACEMENT.rotation, -180, 180),
  };
}

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

export async function readCurrency(fallback: string, allowed: string[]): Promise<string> {
  const jar = await cookies();
  const value = jar.get(CURRENCY_COOKIE)?.value;
  return value && allowed.includes(value) ? value : fallback;
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
  const existing = await getCart(storeId, session);
  if (existing) return existing;
  if (!create) return null;
  const cart: Cart = {
    id: newId("crt"),
    storeId,
    sessionId: session,
    items: [],
    currency: "",
    updatedAt: new Date().toISOString(),
  };
  await db.insertOne(COLLECTIONS.carts, cart as unknown as Record<string, unknown>);
  return cart;
}

async function saveCart(cart: Cart, items: CartItem[], addKeys?: string[]) {
  await db.updateOne(
    COLLECTIONS.carts,
    { id: cart.id },
    { $set: { items, ...(addKeys ? { addKeys } : {}), updatedAt: new Date().toISOString() } },
  );
}

/** Puts a code on the basket, or takes it off again with null. */
async function saveCartDiscount(cart: Cart, code: string | null) {
  await db.updateOne(
    COLLECTIONS.carts,
    { id: cart.id },
    { $set: { discountCode: code, updatedAt: new Date().toISOString() } },
  );
}

/** Puts a gift card code on the basket, or takes it off again with null. */
async function saveCartGiftCard(cart: Cart, code: string | null) {
  await db.updateOne(
    COLLECTIONS.carts,
    { id: cart.id },
    { $set: { giftCardCode: code, updatedAt: new Date().toISOString() } },
  );
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
  const base = store ? localeBase(`/s/${store.slug}`, locale, storeLanguages(store).defaultLocale) : "";
  return { locale, t, format, base };
}

/* -------------------------------------------------------------- add to cart */

export async function addToCart(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const variantId = String(formData.get("variantId") ?? "");
  const quantity = Math.max(1, Math.min(50, Number(formData.get("quantity") ?? 1) || 1));
  const text = String(formData.get("text") ?? "").trim();
  // The product page names the line before it posts, so a resubmission of the
  // same add finds it already stored.
  const lineId = String(formData.get("lineId") ?? "");
  const id = /^cit_[a-z0-9]{12}$/.test(lineId) ? lineId : newId("cit");

  // Independent reads go out together: this action sits between the shopper
  // and the basket they are waiting on.
  const [store, product, cart] = await Promise.all([
    getStore(storeId),
    getStoreProduct(productId),
    loadCart(storeId, true),
  ]);
  const { t, locale } = await shopperCopy(store);
  if (!store || store.status !== "active") {
    return { status: "error", message: t("actions.storeClosed") };
  }
  if (!product || product.storeId !== storeId || !isLive(product)) {
    return { status: "error", message: t("actions.productGone") };
  }
  const variant = product.variants.find((v) => v.id === variantId && v.enabled);
  if (!variant) return { status: "error", message: t("actions.chooseVariant"), field: "variantId" };
  if (variant.availability === "out_of_stock") {
    return {
      status: "error",
      message: t("actions.outOfStock", { variant: variant.name }),
      field: "variantId",
    };
  }
  // A soft check: the units are only held once checkout starts, but a shopper
  // should not fill a basket with more than the store can sell.
  const level = await getLevel(product.id, variant.id);
  const inBasket = (cart?.items ?? []).filter((i) => i.variantId === variant.id).reduce((sum, i) => sum + i.quantity, 0);
  if (!canSell(level, inBasket + quantity) && !cart?.items.some((i) => i.id === id)) {
    const left = level ? Math.max(0, availableOf(level) - inBasket) : 0;
    const name =
      localizeProduct(product, locale, storeLanguages(store).defaultLocale).variants.find((v) => v.id === variant.id)
        ?.name ?? variant.name;
    return {
      status: "error",
      message: left > 0 ? t("actions.onlyLeft", { count: left, variant: name }) : t("actions.soldOut", { variant: name }),
      field: "variantId",
    };
  }
  if (text && !product.shopperCustomization.textLine) {
    return { status: "error", message: t("actions.noTextPersonalisation") };
  }
  if (text.length > product.shopperCustomization.maxTextLength) {
    return {
      status: "error",
      message: t("actions.textTooLong", { max: product.shopperCustomization.maxTextLength }),
      field: "text",
    };
  }

  // The file itself went to /api/uploads before the form was submitted, so only
  // its stored URL and metadata arrive here.
  const stored = readStoredImage(formData, "artwork", "shopperArtwork");
  let artworkUrl: string | null = null;
  let artworkFileName: string | null = null;
  let shopperArtwork: Artwork | null = null;
  let placement: ArtworkPlacement | null = null;

  if (stored) {
    if (!product.shopperCustomization.artworkUpload) {
      return { status: "error", message: t("actions.noArtworkUpload") };
    }
    const catalog = await getCatalogProduct(product.catalogProductId);
    if (!catalog) return { status: "error", message: t("actions.productUnavailable") };
    if (stored.sizeBytes > catalog.fileRequirements.maxFileMb * 1024 * 1024) {
      return {
        status: "error",
        message: t("actions.fileTooLarge", {
          size: (stored.sizeBytes / 1024 / 1024).toFixed(1),
          limit: catalog.fileRequirements.maxFileMb,
        }),
        field: "artwork",
      };
    }

    const area = catalog.printAreas[0];
    // The product page ran these very checks as the file was chosen and would
    // not have let the shopper submit; running them again on the placement that
    // actually arrived is what stops a hand-built request reaching production.
    placement = readPlacement(formData);
    shopperArtwork = {
      id: newId("art"),
      printAreaId: area.id,
      view: area.view,
      fileName: stored.fileName,
      url: stored.url,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      pixelWidth: stored.pixelWidth,
      pixelHeight: stored.pixelHeight,
      hasAlpha: stored.hasAlpha,
      ...placement,
    };
    const issues = shopperBlockingIssues(
      shopperArtworkIssues(shopperArtwork, area, catalog.fileRequirements, (key, values) => t(`artwork.${key}`, values)),
    );
    if (issues.length > 0) {
      return { status: "error", message: issueSentence(issues[0]), field: "artwork" };
    }
    artworkUrl = stored.url;
    artworkFileName = stored.fileName;
  }

  // The browser composites the personalisation onto the product photography,
  // stores it the same way and posts back the URL, so the basket shows what
  // will be printed. When it could not, the line keeps the photo in the chosen
  // colour and the print area, and thumbnails draw the personalisation over it.
  let previewUrl = variantPhoto(product, variant.id);
  let previewOverlay: PreviewOverlay | null = null;
  if (shopperArtwork || text) {
    const rendered = readStoredImage(formData, "preview", "shopperPreview");
    if (rendered) previewUrl = rendered.url;
    else {
      const area = (await getCatalogProduct(product.catalogProductId))?.printAreas[0];
      if (area) {
        previewUrl = variantPhoto(product, variant.id, area.view);
        previewOverlay = { rect: area.rect, textColour: personalisationTextColour(variant.colourHex) };
      }
    }
  }

  if (!cart) return { status: "error", message: t("actions.basketUnavailable") };

  // The basket line keeps the names the shopper saw, in their language.
  const shown = localizeProduct(product, locale, storeLanguages(store).defaultLocale);
  const added: ActionState = { status: "success", message: t("actions.addedToBasket", { product: shown.name }) };
  if (cart.items.some((i) => i.id === id) || cart.addKeys?.includes(id)) return added;
  const item: CartItem = {
    id,
    storeProductId: product.id,
    variantId: variant.id,
    productName: shown.name,
    variantName: shown.variants.find((v) => v.id === variant.id)?.name ?? variant.name,
    quantity,
    unitPrice: variant.price,
    artworkUrl,
    artworkFileName,
    artworkPlacement: placement,
    text: text || null,
    previewUrl,
    previewOverlay,
  };

  // Identical un-personalised lines merge instead of stacking.
  const existing = cart.items.find(
    (i) => i.variantId === item.variantId && !i.text && !i.artworkUrl && !item.text && !item.artworkUrl,
  );
  const items = existing
    ? cart.items.map((i) => (i.id === existing.id ? { ...i, quantity: Math.min(50, i.quantity + quantity) } : i))
    : [...cart.items, item];

  // A line folded into another keeps no id of its own, so the add is remembered.
  await saveCart(cart, items, existing ? [...(cart.addKeys ?? []).slice(-19), id] : undefined);
  refreshBasket(store.slug);
  return added;
}

export async function updateCartItem(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const quantity = Number(formData.get("quantity") ?? 1);
  const [store, cart] = await Promise.all([getStore(storeId), loadCart(storeId, false)]);
  if (!cart || !store) return;

  const items =
    quantity <= 0
      ? cart.items.filter((i) => i.id !== itemId)
      : cart.items.map((i) => (i.id === itemId ? { ...i, quantity: Math.min(50, quantity) } : i));
  await saveCart(cart, items);
  refreshBasket(store.slug);
}

export async function removeCartItem(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const [store, cart] = await Promise.all([getStore(storeId), loadCart(storeId, false)]);
  if (!cart || !store) return;
  await saveCart(
    cart,
    cart.items.filter((i) => i.id !== itemId),
  );
  refreshBasket(store.slug);
}

/* ------------------------------------------------------- discount codes */

/**
 * Puts a code on the basket. Only the code itself is stored: what it is worth is
 * worked out from the stored record on every render and again in `placeOrder`,
 * so nothing the browser sends decides the price.
 */
export async function applyDiscount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const store = await getStore(storeId);
  const { t, format } = await shopperCopy(store);
  if (!store || store.status !== "active") {
    return { status: "error", message: t("actions.storeClosed") };
  }

  const entered = normalizeDiscountCode(String(formData.get("code") ?? ""));
  if (!entered) return { status: "error", message: t("discount.enterCode"), field: "code" };

  const cart = await loadCart(storeId, false);
  if (!cart || cart.items.length === 0) {
    return { status: "error", message: t("actions.basketEmpty") };
  }

  const currency = await readCurrency(store.defaultCurrency, store.currencies);
  const record = await getDiscountCodeByCode(storeId, entered);
  if (!record) return { status: "error", message: t("discount.unknown"), field: "code" };

  const money = (minor: number) => formatMinorUnits(format, minor, currency);
  const { subtotal } = await basketTotals(store, cart.items, currency);
  const verdict = checkDiscount(record, subtotal, currency);
  if (verdict.refusal) {
    return {
      status: "error",
      message: t(`discount.${verdict.refusal}`, { amount: money(verdict.minimum) }),
      field: "code",
    };
  }

  await saveCartDiscount(cart, record.code);
  refreshBasket(store.slug);
  return {
    status: "success",
    message: t("discount.applied", { code: record.code, amount: money(verdict.amount) }),
  };
}

export async function removeDiscount(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const [store, cart] = await Promise.all([getStore(storeId), loadCart(storeId, false)]);
  if (!store || !cart) return;
  await saveCartDiscount(cart, null);
  refreshBasket(store.slug);
}

/* ------------------------------------------------------------- gift cards */

/**
 * Puts a gift card on the basket. As with a discount code, only the code is
 * stored: the balance is read again on every render and once more, with a
 * guarded hold, when the order is placed.
 */
export async function applyGiftCard(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const store = await getStore(storeId);
  const { t, format } = await shopperCopy(store);
  if (!store || store.status !== "active") return { status: "error", message: t("actions.storeClosed") };

  const raw = String(formData.get("code") ?? "");
  if (!raw.trim()) return { status: "error", message: t("giftCard.enterCode"), field: "code" };
  if (!looksLikeGiftCode(raw)) return { status: "error", message: t("giftCard.unknown"), field: "code" };

  const cart = await loadCart(storeId, false);
  if (!cart || cart.items.length === 0) return { status: "error", message: t("actions.basketEmpty") };

  const card = await getGiftCardByCode(storeId, raw);
  const refusal = giftCardRefusal(card);
  if (refusal || !card) return { status: "error", message: t(`giftCard.${refusal ?? "unknown"}`), field: "code" };

  await saveCartGiftCard(cart, card.code);
  refreshBasket(store.slug);
  return {
    status: "success",
    message: t("giftCard.applied", { last4: card.last4, balance: formatMinorUnits(format, card.balance, card.currency) }),
  };
}

export async function removeGiftCard(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const [store, cart] = await Promise.all([getStore(storeId), loadCart(storeId, false)]);
  if (!store || !cart) return;
  await saveCartGiftCard(cart, null);
  refreshBasket(store.slug);
}

/* ------------------------------------------------------------------ checkout */

export async function placeOrder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  const [store, replayed, cart, zones] = await Promise.all([
    getStore(storeId),
    // A retried submission must not create a second order.
    idempotencyKey ? getOrderByIdempotencyKey(storeId, idempotencyKey) : Promise.resolve(null),
    loadCart(storeId, false),
    listShippingZones(storeId),
  ]);
  const { locale, t, base } = await shopperCopy(store);
  if (!store || store.status !== "active") {
    return { status: "error", message: t("actions.storeClosed") };
  }
  if (replayed) {
    if (replayed.status === "awaiting_payment" && replayed.payment.checkoutUrl) redirect(replayed.payment.checkoutUrl);
    redirect(orderStatusUrl(base, replayed.code, await signOrderToken(store.id, replayed.code)));
  }
  const mode = paymentMode(store);
  if (mode === "unavailable") {
    return { status: "error", message: t("payment.accountNotReady") };
  }
  if (!cart || cart.items.length === 0) {
    return { status: "error", message: t("actions.basketEmpty") };
  }

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const line1 = String(formData.get("line1") ?? "").trim();
  const line2 = String(formData.get("line2") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const postalCode = String(formData.get("postalCode") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim().toUpperCase();
  // Only countries with a region line show the field; anything else is dropped.
  const region = addressRegionKind(country) ? String(formData.get("region") ?? "").trim() : "";
  const phone = String(formData.get("phone") ?? "").trim();
  const currency = String(formData.get("currency") ?? store.defaultCurrency);
  const rateId = String(formData.get("shippingRate") ?? "");

  if (name.length < 2) return { status: "error", message: t("actions.enterName"), field: "name" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { status: "error", message: t("actions.enterEmail"), field: "email" };
  }
  if (line1.length < 4) return { status: "error", message: t("actions.enterStreet"), field: "line1" };
  if (city.length < 2) return { status: "error", message: t("actions.enterCity"), field: "city" };
  if (postalCode.length < 3) {
    return { status: "error", message: t("actions.enterPostalCode"), field: "postalCode" };
  }
  // The checkout picker always submits a valid code; this backstops a form
  // posted without it.
  if (!/^[A-Z]{2}$/.test(country)) {
    return { status: "error", message: t("actions.chooseCountry"), field: "country" };
  }
  if (addressRegionKind(country) && region.length < 2) {
    return { status: "error", message: t("actions.enterRegion"), field: "region" };
  }
  if (phone && !/^\+?[\d\s().-]{6,20}$/.test(phone)) {
    return { status: "error", message: t("actions.enterPhone"), field: "phone" };
  }
  if (!store.currencies.includes(currency)) {
    return {
      status: "error",
      message: t("actions.currencyNotSold", { currency }),
      field: "currency",
    };
  }

  // The code is re-read and re-judged here, whatever the basket page showed: a
  // code that expired, was switched off or ran out while the shopper was filling
  // the form in must not reach the charge.
  const discountCode = await cartDiscountCode(storeId, cart);
  const {
    products,
    lines,
    subtotal,
    discount,
    discountRefusal,
    shipping,
    taxRows,
    taxAmount,
    total,
    options,
    shippingOption,
    stripeTax,
    digitalOnly,
  } = await basketTotals(store, cart.items, currency, discountCode, undefined, { zones, country, rateId });
  // A store with shipping zones ships only to their countries. Gift cards on
  // their own ship nothing, so any address will do.
  if (!digitalOnly && zones.length > 0 && !zoneFor(zones, country)) {
    return {
      status: "error",
      message: t("actions.noShippingTo", { country: localCountryName(country, locale) }),
      field: "country",
    };
  }
  if (!shippingOption) {
    return { status: "error", message: t("actions.noShippingRate"), field: "shippingRate" };
  }
  if (discountCode && discountRefusal) {
    await saveCartDiscount(cart, null);
    refreshBasket(store.slug);
    return { status: "error", message: t("discount.dropped", { code: discountCode.code }) };
  }

  // One use is taken before payment, with a write guarded on the count that
  // was read, so two shoppers paying at the same instant cannot both take the
  // last one. A payment that then fails or is abandoned hands it back.
  if (mode === "stripe") await closeOpenCheckouts(store, cart.id);
  let claimed = false;
  if (discount) {
    claimed = await claimDiscountUse(discount.codeId);
    if (!claimed) {
      await saveCartDiscount(cart, null);
      refreshBasket(store.slug);
      return { status: "error", message: t("discount.dropped", { code: discount.code }) };
    }
  }

  // The gift card's share is held on the card before payment, with a write
  // guarded on its balance, so two baskets cannot both spend the last of it.
  // An order that is never paid gives it back.
  const orderId = newId("ord");
  let giftCard: Order["giftCard"] = null;
  let giftCoversAll = false;
  if (cart.giftCardCode) {
    const card = await getGiftCardByCode(storeId, cart.giftCardCode);
    const cover =
      card && !giftCardRefusal(card)
        ? basketGiftCardCover(card, { total, shipping, stripeTax }, currency, mode === "stripe" ? "stripe" : "demo")
        : null;
    if (!card || !cover || cover.amount <= 0 || !(await holdGiftCard(storeId, card.id, orderId, cover.cardAmount))) {
      if (claimed && discount) await releaseDiscountUse(discount.codeId);
      await saveCartGiftCard(cart, null);
      refreshBasket(store.slug);
      return { status: "error", message: t("giftCard.dropped") };
    }
    giftCard = { cardId: card.id, last4: card.last4, amount: cover.amount, cardAmount: cover.cardAmount };
    giftCoversAll = cover.coversAll;
  }
  const releaseGift = () =>
    giftCard ? releaseGiftCardHold({ id: orderId, storeId, code: "", giftCard }) : Promise.resolve(false);
  const due = total - (giftCard?.amount ?? 0);

  // The units are held before the shopper pays, with a conditional write per
  // variant, so two shoppers checking out the last one cannot both have it.
  const reservation = await reserveStock(cart.items);
  if (!reservation.ok) {
    if (claimed && discount) await releaseDiscountUse(discount.codeId);
    await releaseGift();
    const line = cart.items.find((i) => i.variantId === reservation.variantId);
    const variant = line ? `${line.productName} (${line.variantName})` : "";
    return {
      status: "error",
      message:
        reservation.available > 0
          ? t("actions.onlyLeft", { count: reservation.available, variant })
          : t("actions.soldOut", { variant }),
    };
  }
  const held = reservation.inventory;

  const key = idempotencyKey || newId("idem");
  // A demo store checks the test card before anything is written, so a
  // refused card leaves the form as it was.
  let simulated: Awaited<ReturnType<typeof chargeCard>> | null = null;
  if (mode === "demo" && !giftCoversAll) {
    simulated = await chargeCard({
      store,
      amount: due,
      currency,
      cardNumber: String(formData.get("cardNumber") ?? ""),
      expiry: String(formData.get("expiry") ?? ""),
      cvc: String(formData.get("cvc") ?? ""),
      name,
      idempotencyKey: key,
      t: (key, values) => t(`payment.${key}`, values),
    });
    if (!simulated.ok) {
      if (claimed && discount) await releaseDiscountUse(discount.codeId);
      if (held) await releaseLines(held.lines);
      await releaseGift();
      return {
        status: "error",
        message: simulated.message,
        field:
          simulated.code === "invalid_expiry"
            ? "expiry"
            : simulated.code === "invalid_cvc"
              ? "cvc"
              : simulated.code === "currency_unsupported"
                ? "currency"
                : "cardNumber",
      };
    }
  }

  const now = new Date().toISOString();
  const code = orderCode();
  const order: Order = {
    id: orderId,
    storeId,
    code,
    status: "awaiting_payment",
    currency,
    locale,
    customer: {
      name,
      email,
      line1,
      ...(line2 ? { line2 } : {}),
      city,
      ...(region ? { region } : {}),
      postalCode,
      country,
      ...(phone ? { phone } : {}),
    },
    items: cart.items.map((item, index) => ({
      id: newId("oit"),
      storeProductId: item.storeProductId,
      variantId: item.variantId,
      productName: item.productName,
      variantName: item.variantName,
      quantity: item.quantity,
      unitPrice: lines[index].unit,
      supplierCost:
        products[index]?.variants.find((v) => v.id === item.variantId)?.baseCost ?? 0,
      customization: {
        artworkUrl: item.artworkUrl,
        artworkFileName: item.artworkFileName,
        artworkPlacement: item.artworkPlacement ?? null,
        text: item.text,
        previewUrl: item.previewUrl,
        previewOverlay: item.previewOverlay ?? null,
      },
      supplierId: products[index]?.supplierId ?? "",
    })),
    subtotal,
    shipping,
    shippingRate: {
      zoneId: shippingOption.zoneId,
      zoneName: shippingOption.zoneName,
      rateId: shippingOption.rateId,
      name:
        shippingOption.name ||
        (shippingOption.rateId === EMAIL_DELIVERY_RATE_ID ? t("checkout.emailDelivery") : t("checkout.standardShipping")),
      minDays: shippingOption.minDays,
      maxDays: shippingOption.maxDays,
      amount: shippingOption.amount,
    },
    discount,
    giftCard,
    // With Stripe Tax the amount is only known once the shopper has paid; the webhook records it.
    taxAmount,
    taxRate: taxRows.length === 1 ? taxRows[0].rate : 0,
    taxLines: taxRows,
    tax: { mode: stripeTax ? "stripe" : "manual", inclusive: store.pricesIncludeTax },
    total,
    payment: {
      provider: "stripe",
      status: "requires_payment",
      paymentIntentId: null,
      stripeAccountId: mode === "stripe" && !giftCoversAll ? store.stripe.accountId : null,
      last4: null,
      failureMessage: null,
      paidAt: null,
    },
    cartId: cart.id,
    inventory: held,
    fulfillment: {
      supplierId: null,
      supplierName: null,
      routing: "pending",
      supplierOrderRef: null,
      submittedAt: null,
      submissionMessage: null,
      carrier: null,
      trackingNumber: null,
      trackingUrl: null,
      exception: null,
    },
    refunds: [],
    events: [
      {
        at: now,
        status: "Order placed",
        note: giftCoversAll
          ? `Paid with the gift card ending ${giftCard?.last4}.`
          : mode === "demo"
            ? "Demo store: payment is simulated."
            : "Awaiting payment on Stripe Checkout.",
        actor: "Shopper",
      },
    ],
    idempotencyKey: key,
    createdAt: now,
    updatedAt: now,
  };
  await db.insertOne(COLLECTIONS.orders, order as unknown as Record<string, unknown>);
  const token = await signOrderToken(storeId, code);

  if (giftCoversAll && giftCard) {
    await confirmOrderPayment(order, store, {
      paymentIntentId: null,
      last4: null,
      note: `${formatMoney(total, currency)} paid with the gift card ending ${giftCard.last4}.`,
    });
    redirect(orderStatusUrl(base, code, token, "&new=1"));
  }

  if (simulated) {
    await confirmOrderPayment(order, store, {
      paymentIntentId: simulated.paymentIntentId,
      last4: simulated.last4,
      note: `${formatMoney(due, currency)} paid on a demo store${giftCard ? ` and ${formatMoney(giftCard.amount, currency)} with the gift card ending ${giftCard.last4}` : ""}. No money moved.`,
    });
    redirect(orderStatusUrl(base, code, token, "&new=1"));
  }

  // A live store: the shopper pays on Stripe Checkout, and only the verified
  // webhook marks the order paid. The redirect back proves nothing.
  const origin = await siteOrigin();
  const checkout = await createConnectedCheckout({
    accountId: store.stripe.accountId as string,
    metadata: { kind: "order", orderId: order.id, storeId, code },
    idempotencyKey: `order-checkout-${order.id}`,
    currency,
    locale,
    email,
    lines: [
      ...lines.map(({ item, unit }) => ({
        name: item.productName,
        description: item.text ? `${item.variantName} · “${item.text}”` : item.variantName,
        unitAmount: unit,
        quantity: item.quantity,
      })),
      ...(store.pricesIncludeTax || stripeTax
        ? []
        : taxRows.map((row) => ({ name: t("checkout.taxRow", { rate: row.rate }), unitAmount: row.amount, quantity: 1 }))),
    ],
    shipping: null,
    // The shopper's choice first, so Checkout opens on it. The zone's other
    // rates only go beside it under Stripe Tax, which taxes whichever is picked;
    // manual tax lines were worked out for the chosen rate's shipping.
    shippingOptions: (digitalOnly
      ? []
      : [shippingOption, ...(stripeTax ? options.filter((option) => option.rateId !== shippingOption.rateId) : [])]
    ).map(
      (option) => ({
        label: option.name || t("checkout.standardShipping"),
        amount: option.amount,
        minDays: option.minDays,
        maxDays: option.maxDays,
        metadata: { zoneId: option.zoneId, rateId: option.rateId },
      }),
    ),
    allowedCountries: zones.length > 0 && !digitalOnly ? stripeAllowedCountries(zones) : undefined,
    automaticTax: stripeTax ? { inclusive: store.pricesIncludeTax } : null,
    // Stripe Checkout takes one coupon, so a code and a gift card go on it together.
    discount:
      discount || giftCard
        ? {
            code: [discount?.code, giftCard ? t("giftCard.couponName", { last4: giftCard.last4 }) : null]
              .filter(Boolean)
              .join(" + "),
            amount: (discount?.amount ?? 0) + (giftCard?.amount ?? 0),
          }
        : null,
    successUrl: `${origin}${orderStatusUrl(base, code, token, "&paid=1")}`,
    cancelUrl: `${origin}${base}/cart`,
  });
  if (!checkout) {
    await abandonOrderPayment(order, store, "failed");
    return { status: "error", message: t("payment.startFailed") };
  }
  await updateOrder(order.id, {
    payment: { ...order.payment, checkoutSessionId: checkout.id, checkoutUrl: checkout.url },
  });
  revalidatePath(`/app/stores/${storeId}/orders`);
  redirect(checkout.url);
}

/**
 * Closes the Checkout sessions a basket still has open before it opens a new
 * one, so a shopper who came back from Stripe and checks out again cannot pay
 * for the same basket twice. A session Stripe will not expire has already been
 * paid, and the webhook settles that order.
 */
async function closeOpenCheckouts(store: Store, cartId: string) {
  const open = await db.find<Order>(COLLECTIONS.orders, {
    storeId: store.id,
    cartId,
    status: "awaiting_payment",
  });
  for (const order of open) {
    const sessionId = order.payment.checkoutSessionId;
    const accountId = order.payment.stripeAccountId;
    if (sessionId && accountId && !(await expireConnectedCheckout(accountId, sessionId))) continue;
    await abandonOrderPayment(order, store, "expired");
  }
}

/* -------------------------------------------------------------- order status */

/**
 * Opens the order status page for a shopper who can state the order code and
 * the email address on the order. The failure message is deliberately identical
 * for an unknown code and a mismatched email so the form cannot be used to
 * discover which order codes exist.
 */
export async function lookupOrder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const slug = String(formData.get("slug") ?? "");
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const email = String(formData.get("email") ?? "").trim();

  const store = await getStoreBySlug(slug);
  const { t, base } = await shopperCopy(store);

  if (!code) return { status: "error", message: t("actions.enterOrderCode"), field: "code" };
  if (!email) return { status: "error", message: t("actions.enterOrderEmail"), field: "email" };

  const order = store ? await getOrderByCode(store.id, code) : null;
  if (!store || !order || !emailMatchesOrder(order.customer.email, email)) {
    return { status: "error", message: t("actions.lookupFailed") };
  }

  redirect(orderStatusUrl(base, order.code, await signOrderToken(store.id, order.code)));
}

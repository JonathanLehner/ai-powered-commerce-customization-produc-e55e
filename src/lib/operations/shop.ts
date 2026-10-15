import "server-only";
import { revalidatePath } from "next/cache";
import type { getFormatter } from "next-intl/server";
import { formatMinorUnits } from "@/i18n/format";
import type { Locale } from "@/i18n/locales";
import type { shopperTranslator } from "@/i18n/storefront";
import { storeLanguages } from "@/i18n/storefront-routing";
import { issueSentence, shopperArtworkIssues, shopperBlockingIssues } from "../artwork-shopper";
import { isLive } from "../artwork";
import { basketSheetLines, basketTotals, cartDiscountCode, type BasketSheetLine } from "../basket";
import { addressRegionKind, localCountryName } from "../countries";
import { presentmentPrice, presentmentRate, storeFxTable, toShopAmount } from "../currency";
import {
  COLLECTIONS,
  claimDiscountUse,
  getCart,
  getCatalogProduct,
  getDiscountCodeByCode,
  getOrderByCode,
  getOrderByIdempotencyKey,
  getStore,
  getStoreProduct,
  getStoreProductsByIds,
  listShippingZones,
  releaseDiscountUse,
  storefrontPaused,
  updateOrder,
} from "../data";
import { chargeCard, expiryValid, luhnValid } from "../demo-payment";
import { checkDiscount, normalizeDiscountCode } from "../discounts";
import { siteOrigin } from "../email";
import { getGiftCardByCode, holdGiftCard, releaseGiftCardHold } from "../gift-card-data";
import { basketGiftCardCover, giftCardRefusal, looksLikeGiftCode } from "../gift-cards";
import { getLevel, releaseLines, reserveStock, stockShortfall } from "../inventory";
import { availableOf, canSell } from "../inventory-rules";
import { personalisationTextColour, variantPhoto } from "../line-preview";
import { db } from "../mongo";
import { emailMatchesOrder, orderStatusUrl, signOrderToken, verifyOrderToken } from "../order-access";
import { abandonOrderPayment, confirmOrderPayment } from "../order-payment";
import { paymentMode } from "../payment-mode";
import { recordReview } from "../review-data";
import { reviewableItems, reviewProblem } from "../reviews";
import { cleanQuery, searchStore, type SearchDocument } from "../search";
import { storeSearchDocuments } from "../search-data";
import { EMAIL_DELIVERY_RATE_ID, stripeAllowedCountries, zoneFor } from "../shipping";
import { createConnectedCheckout, expireConnectedCheckout } from "../stripe";
import { reportStripeFailure } from "../stripe-alerts";
import { localizeProduct } from "../translations";
import {
  DEFAULT_PLACEMENT,
  type Artwork,
  type ArtworkPlacement,
  type Cart,
  type CartItem,
  type Order,
  type PreviewOverlay,
  type Store,
  type StoreProduct,
  type StoredImage,
} from "../types";
import { customerKey } from "../customers";
import { formatMoney, newId, orderCode } from "../util";
import type { OperationErrorCode } from "./context";

/**
 * The shopper's side of a store: the basket, discount codes and gift cards,
 * checkout, order lookup and search.
 *
 * The storefront's server actions and the Storefront API run these same
 * functions. What differs between them is held in a `ShopperSession`: where the
 * basket is found (the browser's cookie, or the API's cart token), the language
 * and address the answer is written for, the display currency, and what to
 * refresh once the basket has changed. Refusals come back as values with the
 * shopper copy ready to show, never thrown; where the storefront would
 * redirect, the target comes back as a string.
 */

export type StorefrontTranslator = Awaited<ReturnType<typeof shopperTranslator>>;

/** The shopper copy in one language, and the store's address in it. */
export interface ShopperCopy {
  locale: Locale;
  t: StorefrontTranslator;
  format: Awaited<ReturnType<typeof getFormatter>>;
  /**
   * The storefront in the shopper's language: `/s/<slug>`, `/s/<slug>/de`, or
   * `""` on the store's own domain. The API passes an absolute address.
   */
  base: string;
}

export interface ShopperSession {
  /** The shopper's basket in the store. Made when `create` is set and there is none. */
  cart(storeId: string, create: boolean): Promise<Cart | null>;
  copy(store: Store | null): Promise<ShopperCopy>;
  /** The currency the shopper sees prices in. */
  currency(store: Store): Promise<string>;
  /** The basket was saved: whatever shows it is refreshed. */
  basketChanged(store: Store): void;
}

/** A refusal with the shopper copy to show. `code` tells the API which kind it is; invalid when absent. */
export interface ShopRefusal {
  status: "error";
  message: string;
  field?: string;
  code?: Exclude<OperationErrorCode, "invalid">;
  /** Every field that needs fixing, the first of them being `field`. Checkout's form checks only. */
  issues?: { field: string; message: string }[];
}

/** Where the storefront sends the shopper next. */
export interface ShopRedirect {
  status: "redirect";
  to: string;
  orderCode: string;
}

export interface ShopDone {
  status: "success";
  message: string;
}

function refuse(message: string, field?: string, code?: ShopRefusal["code"]): ShopRefusal {
  return { status: "error", message, ...(field ? { field } : {}), ...(code ? { code } : {}) };
}

/* ------------------------------------------------------------------ the cart */

/** The basket filed under `sessionId` in the store, made empty when asked and missing. */
export async function openCart(storeId: string, sessionId: string, create: boolean): Promise<Cart | null> {
  const existing = await getCart(storeId, sessionId);
  if (existing) return existing;
  if (!create) return null;
  const cart: Cart = {
    id: newId("crt"),
    storeId,
    sessionId,
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

/**
 * Placement the shopper set on the product page. Clamped to the same range the
 * configurator allows, because the values arrive from outside and nothing stops
 * a caller sending a scale of 900.
 */
export function readPlacement(read: (key: string) => unknown): ArtworkPlacement {
  const value = (key: string, fallback: number, min: number, max: number) => {
    const raw = read(key);
    // A missing field is a submission from before placement existed, not a
    // zero: those keep the centred default rather than jumping to a corner.
    if ((typeof raw !== "string" && typeof raw !== "number") || String(raw).trim() === "") return fallback;
    const number = Number(raw);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  };
  return {
    x: value("artworkX", DEFAULT_PLACEMENT.x, -0.5, 1.5),
    y: value("artworkY", DEFAULT_PLACEMENT.y, -0.5, 1.5),
    scale: value("artworkScale", DEFAULT_PLACEMENT.scale, 0.05, 2),
    rotation: value("artworkRotation", DEFAULT_PLACEMENT.rotation, -180, 180),
  };
}

export interface AddLineInput {
  storeId: string;
  productId: string;
  variantId: string;
  /** 1 to 50. */
  quantity: number;
  /** The personalisation text, trimmed; empty for none. */
  text: string;
  /** The line's id, named by the caller so a resubmission of the same add lands once. */
  lineId: string;
  /** The shopper's uploaded artwork, already in the asset storage. */
  artwork: StoredImage | null;
  /** Where the artwork sits in the print area; only read with `artwork`. */
  placement: ArtworkPlacement;
  /** A composited preview of the personalised line, already in the asset storage. */
  preview: Pick<StoredImage, "url"> | null;
}

export interface AddLineDone extends ShopDone {
  basket: { lines: BasketSheetLine[]; subtotal: number };
  /** The line just added, at the quantity added. */
  added?: BasketSheetLine & { artworkFileName: string | null };
  /** The line the add landed on: its own, or the identical one it was folded into. */
  lineId: string;
}

export async function addCartLine(session: ShopperSession, input: AddLineInput): Promise<ShopRefusal | AddLineDone> {
  const { storeId, productId, variantId, quantity, text } = input;
  const id = /^cit_[a-z0-9]{12}$/.test(input.lineId) ? input.lineId : newId("cit");

  // Independent reads go out together: this sits between the shopper and the
  // basket they are waiting on.
  const [store, product, cart, level] = await Promise.all([
    getStore(storeId),
    getStoreProduct(productId),
    session.cart(storeId, true),
    getLevel(productId, variantId),
  ]);
  const { t, locale } = await session.copy(store);
  if (!store || store.status !== "active" || (await storefrontPaused(store))) {
    return refuse(t("actions.storeClosed"), undefined, "conflict");
  }
  if (!product || product.storeId !== storeId || !isLive(product)) {
    return refuse(t("actions.productGone"), undefined, "not_found");
  }
  const variant = product.variants.find((v) => v.id === variantId && v.enabled);
  if (!variant) return refuse(t("actions.chooseVariant"), "variantId");
  if (variant.availability === "out_of_stock") {
    return refuse(t("actions.outOfStock", { variant: variant.name }), "variantId");
  }
  // A soft check: the units are only held once checkout starts, but a shopper
  // should not fill a basket with more than the store can sell.
  const inBasket = (cart?.items ?? []).filter((i) => i.variantId === variant.id).reduce((sum, i) => sum + i.quantity, 0);
  if (!canSell(level, inBasket + quantity) && !cart?.items.some((i) => i.id === id)) {
    const left = level ? Math.max(0, availableOf(level) - inBasket) : 0;
    const name =
      localizeProduct(product, locale, storeLanguages(store).defaultLocale).variants.find((v) => v.id === variant.id)
        ?.name ?? variant.name;
    return refuse(left > 0 ? t("actions.onlyLeft", { count: left, variant: name }) : t("actions.soldOut", { variant: name }), "variantId");
  }
  if (text && !product.shopperCustomization.textLine) {
    return refuse(t("actions.noTextPersonalisation"));
  }
  if (text.length > product.shopperCustomization.maxTextLength) {
    return refuse(t("actions.textTooLong", { max: product.shopperCustomization.maxTextLength }), "text");
  }

  // The file itself was uploaded before the add, so only its stored URL and
  // metadata arrive here.
  const stored = input.artwork;
  const [catalog, currency] = await Promise.all([
    stored || text ? getCatalogProduct(product.catalogProductId) : null,
    session.currency(store),
  ]);
  let artworkUrl: string | null = null;
  let artworkFileName: string | null = null;
  let shopperArtwork: Artwork | null = null;
  let placement: ArtworkPlacement | null = null;

  if (stored) {
    if (!product.shopperCustomization.artworkUpload) {
      return refuse(t("actions.noArtworkUpload"));
    }
    if (!catalog) return refuse(t("actions.productUnavailable"), undefined, "not_found");
    if (stored.sizeBytes > catalog.fileRequirements.maxFileMb * 1024 * 1024) {
      return refuse(
        t("actions.fileTooLarge", {
          size: (stored.sizeBytes / 1024 / 1024).toFixed(1),
          limit: catalog.fileRequirements.maxFileMb,
        }),
        "artwork",
      );
    }

    const area = catalog.printAreas[0];
    // The product page ran these very checks as the file was chosen and would
    // not have let the shopper submit; running them again on the placement that
    // actually arrived is what stops a hand-built request reaching production.
    placement = input.placement;
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
      return refuse(issueSentence(issues[0]), "artwork");
    }
    artworkUrl = stored.url;
    artworkFileName = stored.fileName;
  }

  // The line starts on the photo in the chosen colour, with the print area the
  // personalisation is drawn over. The product page composites the real
  // preview once the line is saved and attaches it with attachLinePreview.
  let previewUrl = variantPhoto(product, variant.id);
  let previewOverlay: PreviewOverlay | null = null;
  if (shopperArtwork || text) {
    const rendered = input.preview;
    const area = catalog?.printAreas[0];
    if (rendered) previewUrl = rendered.url;
    else if (area) {
      previewUrl = variantPhoto(product, variant.id, area.view);
      previewOverlay = { rect: area.rect, textColour: personalisationTextColour(variant.colourHex) };
    }
  }

  if (!cart) return refuse(t("actions.basketUnavailable"));

  // The basket line keeps the names the shopper saw, in their language.
  const shown = localizeProduct(product, locale, storeLanguages(store).defaultLocale);
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
  let items = cart.items;
  // A resubmission of an add already stored changes nothing.
  if (!cart.items.some((i) => i.id === id) && !cart.addKeys?.includes(id)) {
    items = existing
      ? cart.items.map((i) => (i.id === existing.id ? { ...i, quantity: Math.min(50, i.quantity + quantity) } : i))
      : [...cart.items, item];
    // A line folded into another keeps no id of its own, so the add is remembered.
    await saveCart(cart, items, existing ? [...(cart.addKeys ?? []).slice(-19), id] : undefined);
  }

  // The saved basket goes back with the answer, so the page the shopper is on
  // is not rendered again just to update the header.
  const others = [...new Set(items.map((i) => i.storeProductId))].filter((pid) => pid !== product.id);
  const products = others.length > 0 ? await getStoreProductsByIds(others) : new Map<string, StoreProduct>();
  products.set(product.id, product);
  const totals = await basketTotals(store, items, currency, null, { products, brackets: [] });
  const lines = basketSheetLines(totals);
  const line = lines.find((l) => l.id === (existing?.id ?? id)) ?? lines.find((l) => l.id === id);
  const unit = totals.lines.find((l) => l.item.id === line?.id)?.unit ?? 0;
  return {
    status: "success",
    message: t("actions.addedToBasket", { product: shown.name }),
    basket: { lines, subtotal: totals.subtotal },
    added: line ? { ...line, quantity, amount: unit * quantity, artworkFileName } : undefined,
    lineId: line?.id ?? id,
  };
}

/**
 * Puts the composited preview on a personalised line once it has been drawn
 * and stored. Until then the line shows the photo with the personalisation
 * drawn over it. A line without personalisation keeps its photo.
 */
export async function attachLinePreview(
  session: ShopperSession,
  storeId: string,
  itemId: string,
  preview: Pick<StoredImage, "url"> | null,
): Promise<void> {
  if (!preview) return;
  const cart = await session.cart(storeId, false);
  const line = cart?.items.find((i) => i.id === itemId);
  if (!cart || !line || (!line.text && !line.artworkUrl)) return;
  await db.updateOne(
    COLLECTIONS.carts,
    { id: cart.id, "items.id": itemId },
    { $set: { "items.$.previewUrl": preview.url, "items.$.previewOverlay": null } },
  );
}

/** Sets a line's quantity, at most 50; zero or less takes the line off. */
export async function updateCartLine(session: ShopperSession, storeId: string, itemId: string, quantity: number): Promise<void> {
  const [store, cart] = await Promise.all([getStore(storeId), session.cart(storeId, false)]);
  if (!cart || !store) return;

  const items =
    quantity <= 0
      ? cart.items.filter((i) => i.id !== itemId)
      : cart.items.map((i) => (i.id === itemId ? { ...i, quantity: Math.min(50, quantity) } : i));
  await saveCart(cart, items);
  session.basketChanged(store);
}

export async function removeCartLine(session: ShopperSession, storeId: string, itemId: string): Promise<void> {
  const [store, cart] = await Promise.all([getStore(storeId), session.cart(storeId, false)]);
  if (!cart || !store) return;
  await saveCart(
    cart,
    cart.items.filter((i) => i.id !== itemId),
  );
  session.basketChanged(store);
}

/* ------------------------------------------------------- discount codes */

/**
 * Puts a code on the basket. Only the code itself is stored: what it is worth is
 * worked out from the stored record on every render and again in `placeOrder`,
 * so nothing the caller sends decides the price.
 */
export async function applyDiscount(session: ShopperSession, storeId: string, rawCode: string): Promise<ShopRefusal | ShopDone> {
  const store = await getStore(storeId);
  const { t, format } = await session.copy(store);
  if (!store || store.status !== "active") {
    return refuse(t("actions.storeClosed"), undefined, "conflict");
  }

  const entered = normalizeDiscountCode(rawCode);
  if (!entered) return refuse(t("discount.enterCode"), "code");

  const cart = await session.cart(storeId, false);
  if (!cart || cart.items.length === 0) {
    return refuse(t("actions.basketEmpty"), undefined, "conflict");
  }

  const currency = await session.currency(store);
  const record = await getDiscountCodeByCode(storeId, entered);
  if (!record) return refuse(t("discount.unknown"), "code");

  const money = (minor: number) => formatMinorUnits(format, minor, currency);
  const { subtotal } = await basketTotals(store, cart.items, currency);
  const verdict = checkDiscount(record, subtotal, currency, undefined, storeFxTable(store));
  if (verdict.refusal) {
    return refuse(t(`discount.${verdict.refusal}`, { amount: money(verdict.minimum) }), "code");
  }

  await saveCartDiscount(cart, record.code);
  session.basketChanged(store);
  return {
    status: "success",
    message: t("discount.applied", { code: record.code, amount: money(verdict.amount) }),
  };
}

export async function removeDiscount(session: ShopperSession, storeId: string): Promise<void> {
  const [store, cart] = await Promise.all([getStore(storeId), session.cart(storeId, false)]);
  if (!store || !cart) return;
  await saveCartDiscount(cart, null);
  session.basketChanged(store);
}

/* ------------------------------------------------------------- gift cards */

/**
 * Puts a gift card on the basket. As with a discount code, only the code is
 * stored: the balance is read again on every render and once more, with a
 * guarded hold, when the order is placed.
 */
export async function applyGiftCard(session: ShopperSession, storeId: string, raw: string): Promise<ShopRefusal | ShopDone> {
  const store = await getStore(storeId);
  const { t, format } = await session.copy(store);
  if (!store || store.status !== "active") return refuse(t("actions.storeClosed"), undefined, "conflict");

  if (!raw.trim()) return refuse(t("giftCard.enterCode"), "code");
  if (!looksLikeGiftCode(raw)) return refuse(t("giftCard.unknown"), "code");

  const cart = await session.cart(storeId, false);
  if (!cart || cart.items.length === 0) return refuse(t("actions.basketEmpty"), undefined, "conflict");

  const card = await getGiftCardByCode(storeId, raw);
  const refusal = giftCardRefusal(card);
  if (refusal || !card) return refuse(t(`giftCard.${refusal ?? "unknown"}`), "code");

  await saveCartGiftCard(cart, card.code);
  session.basketChanged(store);
  return {
    status: "success",
    message: t("giftCard.applied", { last4: card.last4, balance: formatMinorUnits(format, card.balance, card.currency) }),
  };
}

export async function removeGiftCard(session: ShopperSession, storeId: string): Promise<void> {
  const [store, cart] = await Promise.all([getStore(storeId), session.cart(storeId, false)]);
  if (!store || !cart) return;
  await saveCartGiftCard(cart, null);
  session.basketChanged(store);
}

/* ------------------------------------------------------------------ checkout */

/** The checkout form, as typed. Trimmed and checked by `placeOrder`. */
export interface CheckoutInput {
  storeId: string;
  /** Sending the same key again finds the order the first attempt made. */
  idempotencyKey: string;
  name: string;
  email: string;
  line1: string;
  line2: string;
  city: string;
  postalCode: string;
  country: string;
  region: string;
  phone: string;
  /** Null for the store's own currency. */
  currency: string | null;
  shippingRate: string;
  marketingConsent: boolean;
  /** A demo store's simulated card. */
  cardNumber: string;
  expiry: string;
  cvc: string;
  /** Run every check and price the order, but place nothing, hold nothing and charge nothing. */
  dryRun?: boolean;
}

/** What a dry run of checkout would have placed. */
export interface CheckoutPreview {
  status: "preview";
  /** The storefront's checkout page: no order exists yet to pay. */
  to: string;
  /** How the order would be paid: on Stripe Checkout, with the demo card, or wholly by the gift card. */
  payment: "stripe" | "demo" | "gift_card";
  order: Pick<
    Order,
    "currency" | "customer" | "subtotal" | "shipping" | "shippingRate" | "discount" | "taxAmount" | "taxLines" | "total"
  > & {
    lines: { productId: string; variantId: string; productName: string; variantName: string; quantity: number; unitPrice: number; text: string | null }[];
    giftCard: { last4: string; amount: number } | null;
    amountDue: number;
  };
}

/** The checkout form field a demo card refusal is about. */
function cardField(code: string | undefined): string {
  if (code === "invalid_expiry") return "expiry";
  if (code === "invalid_cvc") return "cvc";
  if (code === "currency_unsupported") return "currency";
  return "cardNumber";
}

/** A path on this site, or an address already absolute, made absolute. */
function absolute(origin: string, path: string): string {
  return /^https?:\/\//.test(path) ? path : `${origin}${path}`;
}

export async function placeOrder(
  session: ShopperSession,
  input: CheckoutInput,
): Promise<ShopRefusal | ShopRedirect | CheckoutPreview> {
  const { storeId, idempotencyKey, dryRun } = input;
  const [store, replayed, cart, zones] = await Promise.all([
    getStore(storeId),
    // A retried submission must not create a second order.
    idempotencyKey && !dryRun ? getOrderByIdempotencyKey(storeId, idempotencyKey) : Promise.resolve(null),
    session.cart(storeId, false),
    listShippingZones(storeId),
  ]);
  const { locale, t, base } = await session.copy(store);
  if (!store || store.status !== "active" || (await storefrontPaused(store))) {
    return refuse(t("actions.storeClosed"), undefined, "conflict");
  }
  if (replayed) {
    if (replayed.status === "awaiting_payment" && replayed.payment.checkoutUrl) {
      return { status: "redirect", to: replayed.payment.checkoutUrl, orderCode: replayed.code };
    }
    return {
      status: "redirect",
      to: orderStatusUrl(base, replayed.code, await signOrderToken(store.id, replayed.code)),
      orderCode: replayed.code,
    };
  }
  const mode = paymentMode(store);
  if (mode === "unavailable") {
    return refuse(t("payment.accountNotReady"), undefined, "conflict");
  }
  if (!cart || cart.items.length === 0) {
    return refuse(t("actions.basketEmpty"), undefined, "conflict");
  }

  const name = input.name.trim();
  const email = input.email.trim();
  const line1 = input.line1.trim();
  const line2 = input.line2.trim();
  const city = input.city.trim();
  const postalCode = input.postalCode.trim();
  const country = input.country.trim().toUpperCase();
  // Only countries with a region line show the field; anything else is dropped.
  const region = addressRegionKind(country) ? input.region.trim() : "";
  const phone = input.phone.trim();
  const currency = input.currency ?? store.defaultCurrency;
  const rateId = input.shippingRate;

  // Every form check runs before any is answered, so one reply names all the
  // fields to fix.
  const issues: { field: string; message: string }[] = [];
  const check = (ok: boolean, field: string, message: string) => {
    if (!ok) issues.push({ field, message });
  };
  check(name.length >= 2, "name", t("actions.enterName"));
  check(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email), "email", t("actions.enterEmail"));
  check(line1.length >= 4, "line1", t("actions.enterStreet"));
  check(city.length >= 2, "city", t("actions.enterCity"));
  check(postalCode.length >= 3, "postalCode", t("actions.enterPostalCode"));
  // The checkout picker always submits a valid code; this backstops a form
  // posted without it.
  const validCountry = /^[A-Z]{2}$/.test(country);
  check(validCountry, "country", t("actions.chooseCountry"));
  check(!validCountry || !addressRegionKind(country) || region.length >= 2, "region", t("actions.enterRegion"));
  check(!phone || /^\+?[\d\s().-]{6,20}$/.test(phone), "phone", t("actions.enterPhone"));
  check(store.currencies.includes(currency), "currency", t("actions.currencyNotSold", { currency }));
  // Without a gift card, a demo store always takes the test card, so its form
  // is checked here too. With one, it is only needed if the card falls short.
  if (mode === "demo" && !cart.giftCardCode) {
    const digits = input.cardNumber.replace(/\D/g, "");
    check(luhnValid(digits), "cardNumber", t("payment.invalidNumber"));
    check(expiryValid(input.expiry), "expiry", t("payment.invalidExpiry"));
    check(/^\d{3,4}$/.test(input.cvc.trim()), "cvc", t("payment.invalidCvc"));
  }
  if (issues.length > 0) return { ...refuse(issues[0].message, issues[0].field), issues };

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
    taxUnavailable,
    digitalOnly,
  } = await basketTotals(store, cart.items, currency, discountCode, undefined, { zones, country, rateId });
  // A store with shipping zones ships only to their countries. Gift cards on
  // their own ship nothing, so any address will do.
  if (!digitalOnly && zones.length > 0 && !zoneFor(zones, country)) {
    return refuse(t("actions.noShippingTo", { country: localCountryName(country, locale) }), "country");
  }
  if (!shippingOption) {
    return refuse(t("actions.noShippingRate"), "shippingRate");
  }
  if (taxUnavailable) {
    return refuse(t("actions.noTaxFor", { country: localCountryName(country, locale) }), "country");
  }
  if (discountCode && discountRefusal) {
    if (dryRun) return refuse(t("discount.dropped", { code: discountCode.code }), undefined, "conflict");
    await saveCartDiscount(cart, null);
    session.basketChanged(store);
    return refuse(t("discount.dropped", { code: discountCode.code }), undefined, "conflict");
  }

  if (dryRun) {
    const card = cart.giftCardCode ? await getGiftCardByCode(storeId, cart.giftCardCode) : null;
    const cover =
      card && !giftCardRefusal(card)
        ? basketGiftCardCover(card, { total, shipping, stripeTax }, currency, mode === "stripe" ? "stripe" : "demo", storeFxTable(store))
        : null;
    if (cart.giftCardCode && (!card || !cover || cover.amount <= 0)) {
      return refuse(t("giftCard.dropped"), undefined, "conflict");
    }
    const short = await stockShortfall(cart.items);
    if (short) {
      const line = cart.items.find((i) => i.variantId === short.variantId);
      const variant = line ? `${line.productName} (${line.variantName})` : "";
      return refuse(
        short.available > 0 ? t("actions.onlyLeft", { count: short.available, variant }) : t("actions.soldOut", { variant }),
        undefined,
        "conflict",
      );
    }
    const coversAll = cover?.coversAll ?? false;
    if (mode === "demo" && !coversAll) {
      // The demo card check moves no money, so a dry run runs it as placing would.
      const simulated = await chargeCard({
        store,
        amount: total - (cover?.amount ?? 0),
        currency,
        cardNumber: input.cardNumber,
        expiry: input.expiry,
        cvc: input.cvc,
        name,
        idempotencyKey: idempotencyKey || newId("idem"),
        t: (key, values) => t(`payment.${key}`, values),
      });
      if (!simulated.ok) return refuse(simulated.message, cardField(simulated.code), "payment_failed");
    }
    return {
      status: "preview",
      to: `${base}/checkout`,
      payment: coversAll ? "gift_card" : mode === "stripe" ? "stripe" : "demo",
      order: {
        currency,
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
        lines: lines.map(({ item, unit }) => ({
          productId: item.storeProductId,
          variantId: item.variantId,
          productName: item.productName,
          variantName: item.variantName,
          quantity: item.quantity,
          unitPrice: unit,
          text: item.text,
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
        giftCard: cover && card ? { last4: card.last4, amount: cover.amount } : null,
        taxAmount,
        taxLines: taxRows,
        total,
        amountDue: total - (cover?.amount ?? 0),
      },
    };
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
      session.basketChanged(store);
      return refuse(t("discount.dropped", { code: discount.code }), undefined, "conflict");
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
        ? basketGiftCardCover(card, { total, shipping, stripeTax }, currency, mode === "stripe" ? "stripe" : "demo", storeFxTable(store))
        : null;
    if (!card || !cover || cover.amount <= 0 || !(await holdGiftCard(storeId, card.id, orderId, cover.cardAmount))) {
      if (claimed && discount) await releaseDiscountUse(discount.codeId);
      await saveCartGiftCard(cart, null);
      session.basketChanged(store);
      return refuse(t("giftCard.dropped"), undefined, "conflict");
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
    return refuse(
      reservation.available > 0
        ? t("actions.onlyLeft", { count: reservation.available, variant })
        : t("actions.soldOut", { variant }),
      undefined,
      "conflict",
    );
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
      cardNumber: input.cardNumber,
      expiry: input.expiry,
      cvc: input.cvc,
      name,
      idempotencyKey: key,
      t: (key, values) => t(`payment.${key}`, values),
    });
    if (!simulated.ok) {
      if (claimed && discount) await releaseDiscountUse(discount.codeId);
      if (held) await releaseLines(held.lines);
      await releaseGift();
      return refuse(simulated.message, cardField(simulated.code), "payment_failed");
    }
  }

  const now = new Date().toISOString();
  const code = orderCode();
  const order: Order = {
    id: orderId,
    storeId,
    code,
    status: "awaiting_payment",
    ...(mode === "demo" && store.testMode ? { test: true } : {}),
    currency,
    // What the order comes to in the store's own currency, at the rate it was priced at.
    shopCurrency: store.defaultCurrency,
    shopTotal: toShopAmount(store, total, currency),
    exchangeRate: presentmentRate(store, currency),
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
      customizationCost: products[index]?.costs.customizationCost ?? 0,
      shippingCost: products[index]?.costs.shippingEstimate ?? 0,
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
    marketingConsent: input.marketingConsent,
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
            ? store.testMode
              ? "Test mode: payment is simulated."
              : "Demo store: payment is simulated."
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
    return { status: "redirect", to: orderStatusUrl(base, code, token, "&new=1"), orderCode: code };
  }

  if (simulated) {
    await confirmOrderPayment(order, store, {
      paymentIntentId: simulated.paymentIntentId,
      last4: simulated.last4,
      note: `${formatMoney(due, currency)} paid ${store.testMode ? "in test mode" : "on a demo store"}${giftCard ? ` and ${formatMoney(giftCard.amount, currency)} with the gift card ending ${giftCard.last4}` : ""}. No money moved.`,
    });
    return { status: "redirect", to: orderStatusUrl(base, code, token, "&new=1"), orderCode: code };
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
    successUrl: absolute(origin, orderStatusUrl(base, code, token, "&paid=1")),
    cancelUrl: absolute(origin, `${base}/cart`),
  });
  if (!checkout.ok) {
    const { failure } = checkout;
    await reportStripeFailure(failure, { operation: "checkout", store });
    await abandonOrderPayment(order, store, "failed", { note: `Stripe could not open Checkout: ${failure.message}` });
    const message =
      failure.kind === "invalid"
        ? failure.message
        : t(failure.kind === "platform" ? "payment.accountNotReady" : "payment.startFailed");
    return refuse(message, undefined, "payment_failed");
  }
  await updateOrder(order.id, {
    payment: { ...order.payment, checkoutSessionId: checkout.value.id, checkoutUrl: checkout.value.url },
  });
  revalidatePath(`/app/stores/${storeId}/orders`);
  return { status: "redirect", to: checkout.value.url, orderCode: code };
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
    await abandonOrderPayment(order, store, "expired", { superseded: true });
  }
}

/* -------------------------------------------------------------- order status */

/**
 * Opens the order status page for a shopper who can state the order code and
 * the email address on the order. The failure message is deliberately identical
 * for an unknown code and a mismatched email so it cannot be used to discover
 * which order codes exist.
 */
export async function lookupOrder(
  store: Store | null,
  copy: Pick<ShopperCopy, "t" | "base">,
  rawCode: string,
  rawEmail: string,
): Promise<ShopRefusal | (ShopRedirect & { order: Order })> {
  const { t, base } = copy;
  const code = rawCode.trim().toUpperCase();
  const email = rawEmail.trim();

  if (!code) return refuse(t("actions.enterOrderCode"), "code");
  if (!email) return refuse(t("actions.enterOrderEmail"), "email");

  const order = store ? await getOrderByCode(store.id, code) : null;
  if (!store || !order || !emailMatchesOrder(order.customer.email, email)) {
    return refuse(t("actions.lookupFailed"), undefined, "not_found");
  }

  return {
    status: "redirect",
    to: orderStatusUrl(base, order.code, await signOrderToken(store.id, order.code)),
    orderCode: order.code,
    order,
  };
}

/* ------------------------------------------------------------------- search */

/** What the shopper can find for `query`, best first, priced in `currency`. */
export async function searchShop(
  store: Store,
  locale: Locale,
  query: string,
  currency: string,
  limit: number,
): Promise<(SearchDocument & { displayPrice: number | null })[]> {
  const q = cleanQuery(query);
  if (q.length < 2) return [];
  if (store.status !== "active") return [];
  const documents = await storeSearchDocuments(store, locale);
  return searchStore(documents, q, limit).map((doc) => ({
    ...doc,
    displayPrice: doc.price !== null && doc.currency ? presentmentPrice(store, doc.price, doc.currency, currency) : null,
  }));
}

/* ------------------------------------------------------------------ reviews */

export interface ReviewInput {
  code: string;
  /** The order's signed token, from the link the shopper was sent. */
  token: string;
  productId: string;
  rating: number;
  title: string;
  body: string;
  authorName: string;
}

/**
 * A verified buyer's review. The order page only shows the form behind the
 * order's signed link, and this checks that link again, along with the order
 * having been delivered and the product being on it.
 */
export async function submitReview(
  store: Store | null,
  copy: Pick<ShopperCopy, "t" | "locale">,
  input: ReviewInput,
): Promise<ShopRefusal | ShopDone> {
  const { t, locale } = copy;
  if (!store || !(await verifyOrderToken(store.id, input.code, input.token))) {
    return refuse(t("reviews.notAllowed"), undefined, "conflict");
  }
  const order = await getOrderByCode(store.id, input.code);
  if (!order) return refuse(t("reviews.notAllowed"), undefined, "conflict");
  const products = await getStoreProductsByIds(order.items.map((item) => item.storeProductId));
  const giftCards = new Set([...products.values()].filter((p) => p.giftCard).map((p) => p.id));
  const item = reviewableItems(order, giftCards).find((entry) => entry.productId === input.productId);
  if (!item) return refuse(t("reviews.notAllowed"), undefined, "conflict");

  const review = { rating: input.rating, title: input.title, body: input.body, authorName: input.authorName };
  const problem = reviewProblem(review);
  if (problem) return refuse(t(`reviews.${problem.problem}`), problem.field);

  await recordReview(store, order, item, review, locale);
  revalidatePath(`/s/${store.slug}`, "layout");
  return { status: "success", message: t("reviews.thanks") };
}

/* ---------------------------------------------------------------- newsletter */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Signs an address up for the store's email. Signing up again keeps the one
 * record and only refreshes it, so a double click or a resubmitted form never
 * makes two. A customer already on file gets the same choice on their record.
 */
export async function subscribeToNewsletter(
  store: Store | null,
  copy: Pick<ShopperCopy, "t" | "locale">,
  input: { email: string; source: string },
): Promise<ShopRefusal | ShopDone> {
  const { t, locale } = copy;
  if (!store || store.status !== "active") return refuse(t("sections.newsletterClosed"), undefined, "conflict");
  const email = customerKey(input.email);
  if (email.length > 254 || !EMAIL.test(email)) return refuse(t("sections.newsletterInvalid"), "email");
  const now = new Date().toISOString();
  try {
    await db.upsertOne(
      COLLECTIONS.newsletterSubscribers,
      { storeId: store.id, email },
      {
        $set: { locale, subscribed: true, updatedAt: now },
        $setOnInsert: { id: newId("nws"), storeId: store.id, email, source: input.source.slice(0, 40), createdAt: now },
      },
    );
  } catch (error) {
    // Two sign-ups of one address at the same instant: the unique index keeps one.
    if ((error as { code?: number }).code !== 11000) throw error;
  }
  await db.updateOne(COLLECTIONS.customers, { storeId: store.id, email }, { $set: { marketing: { subscribed: true, updatedAt: now } } });
  return { status: "success", message: t("sections.newsletterThanks") };
}

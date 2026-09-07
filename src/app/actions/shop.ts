"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  issueSentence,
  shopperArtworkIssues,
  shopperBlockingIssues,
} from "@/lib/artwork-shopper";
import {
  COLLECTIONS,
  getCart,
  getCatalogProduct,
  getOrderByCode,
  getOrderByIdempotencyKey,
  getStore,
  getStoreBySlug,
  getStoreProduct,
  recordAudit,
} from "@/lib/data";
import { copyFor, fmt } from "@/lib/i18n";
import { emailMatchesOrder, orderStatusUrl, signOrderToken } from "@/lib/order-access";
import { isLive } from "@/lib/artwork";
import { basketTotals } from "@/lib/basket";
import { routeOrder } from "@/lib/fulfillment";
import { readStoredImage } from "@/lib/uploads";
import { db } from "@/lib/platform";
import { SHOPPER_COOKIE } from "@/lib/session";
import { chargeCard } from "@/lib/stripe";
import {
  DEFAULT_PLACEMENT,
  type Artwork,
  type ArtworkPlacement,
  type Cart,
  type CartItem,
  type Order,
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

export async function setCurrency(formData: FormData): Promise<void> {
  const currency = String(formData.get("currency") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const back = String(formData.get("back") ?? `/s/${slug}`);
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
  redirect(back);
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

async function saveCart(cart: Cart, items: CartItem[]) {
  await db.updateOne(
    COLLECTIONS.carts,
    { id: cart.id },
    { $set: { items, updatedAt: new Date().toISOString() } },
  );
}

/* -------------------------------------------------------------- add to cart */

export async function addToCart(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const variantId = String(formData.get("variantId") ?? "");
  const quantity = Math.max(1, Math.min(50, Number(formData.get("quantity") ?? 1) || 1));
  const text = String(formData.get("text") ?? "").trim();

  const [store, product] = await Promise.all([getStore(storeId), getStoreProduct(productId)]);
  const t = copyFor(store?.defaultLanguage);
  if (!store || store.status !== "active") {
    return { status: "error", message: t.actions.storeClosed };
  }
  if (!product || product.storeId !== storeId || !isLive(product)) {
    return { status: "error", message: t.actions.productGone };
  }
  const variant = product.variants.find((v) => v.id === variantId && v.enabled);
  if (!variant) return { status: "error", message: t.actions.chooseVariant, field: "variantId" };
  if (variant.availability === "out_of_stock") {
    return {
      status: "error",
      message: fmt(t.actions.outOfStock, { variant: variant.name }),
      field: "variantId",
    };
  }
  if (text && !product.shopperCustomization.textLine) {
    return { status: "error", message: t.actions.noTextPersonalisation };
  }
  if (text.length > product.shopperCustomization.maxTextLength) {
    return {
      status: "error",
      message: fmt(t.actions.textTooLong, { max: product.shopperCustomization.maxTextLength }),
      field: "text",
    };
  }

  const catalog = await getCatalogProduct(product.catalogProductId);
  // The file itself went to /api/uploads before the form was submitted, so only
  // its stored URL and metadata arrive here.
  const stored = readStoredImage(formData, "artwork", "shopperArtwork");
  let artworkUrl: string | null = null;
  let artworkFileName: string | null = null;
  let shopperArtwork: Artwork | null = null;
  let placement: ArtworkPlacement | null = null;

  if (stored) {
    if (!product.shopperCustomization.artworkUpload) {
      return { status: "error", message: t.actions.noArtworkUpload };
    }
    if (!catalog) return { status: "error", message: t.actions.productUnavailable };
    if (stored.sizeBytes > catalog.fileRequirements.maxFileMb * 1024 * 1024) {
      return {
        status: "error",
        message: fmt(t.actions.fileTooLarge, {
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
      shopperArtworkIssues(shopperArtwork, area, catalog.fileRequirements, t.artwork),
    );
    if (issues.length > 0) {
      return { status: "error", message: issueSentence(issues[0]), field: "artwork" };
    }
    artworkUrl = stored.url;
    artworkFileName = stored.fileName;
  }

  // The browser composites the personalisation onto the product photography,
  // stores it the same way and posts back the URL, so the basket shows what
  // will be printed.
  let previewUrl = product.mockups[0]?.url ?? null;
  if (shopperArtwork || text) {
    const rendered = readStoredImage(formData, "preview", "shopperPreview");
    if (rendered) previewUrl = rendered.url;
  }

  const cart = await loadCart(storeId, true);
  if (!cart) return { status: "error", message: t.actions.basketUnavailable };

  const item: CartItem = {
    id: newId("cit"),
    storeProductId: product.id,
    variantId: variant.id,
    productName: product.name,
    variantName: variant.name,
    quantity,
    unitPrice: variant.price,
    artworkUrl,
    artworkFileName,
    artworkPlacement: placement,
    text: text || null,
    previewUrl,
  };

  // Identical un-personalised lines merge instead of stacking.
  const existing = cart.items.find(
    (i) => i.variantId === item.variantId && !i.text && !i.artworkUrl && !item.text && !item.artworkUrl,
  );
  const items = existing
    ? cart.items.map((i) => (i.id === existing.id ? { ...i, quantity: Math.min(50, i.quantity + quantity) } : i))
    : [...cart.items, item];

  await saveCart(cart, items);
  revalidatePath(`/s/${store.slug}/cart`);
  return { status: "success", message: fmt(t.actions.addedToBasket, { product: product.name }) };
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
  revalidatePath(`/s/${store.slug}/cart`);
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
  revalidatePath(`/s/${store.slug}/cart`);
}

/* ------------------------------------------------------------------ checkout */

export async function placeOrder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  const [store, replayed, cart] = await Promise.all([
    getStore(storeId),
    // A retried submission must not create a second order.
    idempotencyKey ? getOrderByIdempotencyKey(idempotencyKey) : Promise.resolve(null),
    loadCart(storeId, false),
  ]);
  const t = copyFor(store?.defaultLanguage);
  if (!store || store.status !== "active") {
    return { status: "error", message: t.actions.storeClosed };
  }
  if (replayed) {
    redirect(orderStatusUrl(store.slug, replayed.code, await signOrderToken(store.id, replayed.code)));
  }
  if (!cart || cart.items.length === 0) {
    return { status: "error", message: t.actions.basketEmpty };
  }

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const line1 = String(formData.get("line1") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const postalCode = String(formData.get("postalCode") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim().toUpperCase();
  const currency = String(formData.get("currency") ?? store.defaultCurrency);
  const cardNumber = String(formData.get("cardNumber") ?? "");
  const expiry = String(formData.get("expiry") ?? "");
  const cvc = String(formData.get("cvc") ?? "");

  if (name.length < 2) return { status: "error", message: t.actions.enterName, field: "name" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { status: "error", message: t.actions.enterEmail, field: "email" };
  }
  if (line1.length < 4) return { status: "error", message: t.actions.enterStreet, field: "line1" };
  if (city.length < 2) return { status: "error", message: t.actions.enterCity, field: "city" };
  if (postalCode.length < 3) {
    return { status: "error", message: t.actions.enterPostalCode, field: "postalCode" };
  }
  // The checkout picker always submits a valid code; this backstops a form
  // posted without it.
  if (!/^[A-Z]{2}$/.test(country)) {
    return { status: "error", message: t.actions.chooseCountry, field: "country" };
  }
  if (!store.currencies.includes(currency)) {
    return {
      status: "error",
      message: fmt(t.actions.currencyNotSold, { currency }),
      field: "currency",
    };
  }

  const { products, lines, subtotal, shipping, taxRows, taxAmount, total } = await basketTotals(
    store,
    cart.items,
    currency,
  );

  const key = idempotencyKey || newId("idem");
  const charge = await chargeCard({
    store,
    amount: total,
    currency,
    cardNumber,
    expiry,
    cvc,
    name,
    idempotencyKey: key,
  });
  if (!charge.ok) {
    return {
      status: "error",
      message: charge.message,
      field:
        charge.code === "invalid_expiry"
          ? "expiry"
          : charge.code === "invalid_cvc"
            ? "cvc"
            : charge.code === "currency_unsupported"
              ? "currency"
              : "cardNumber",
    };
  }

  const now = new Date().toISOString();
  const code = orderCode();
  const order: Order = {
    id: newId("ord"),
    storeId,
    code,
    status: "paid",
    currency,
    customer: { name, email, line1, city, postalCode, country },
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
      },
      supplierId: products[index]?.supplierId ?? "",
    })),
    subtotal,
    shipping,
    taxAmount,
    taxRate: taxRows.length === 1 ? taxRows[0].rate : 0,
    taxLines: taxRows,
    total,
    payment: {
      provider: "stripe",
      status: "succeeded",
      paymentIntentId: charge.paymentIntentId,
      stripeAccountId: store.stripe.accountId,
      last4: charge.last4,
      failureMessage: null,
      paidAt: now,
    },
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
        status: "Payment captured",
        note: `${formatMoney(total, currency)} charged via Stripe (${store.stripe.accountId}).`,
        actor: "Stripe",
      },
    ],
    idempotencyKey: key,
    createdAt: now,
    updatedAt: now,
  };

  // Route the paid order to production and record the result on the order.
  const decision = await routeOrder(order, store);
  order.fulfillment = {
    ...order.fulfillment,
    supplierId: decision.supplierId,
    supplierName: decision.supplierName,
    routing: decision.routing,
    supplierOrderRef: decision.supplierOrderRef,
    submittedAt: decision.routing === "submitted" ? now : null,
    submissionMessage: decision.message,
    exception: decision.exception,
  };
  order.events.push({
    at: now,
    status: decision.routing === "submitted" ? "Sent to supplier" : "Manual handling required",
    note: decision.message,
    actor: "Parcelith routing",
  });
  if (decision.routing === "submitted") order.status = "in_production";
  if (decision.exception) order.status = "exception";

  await db.insertOne(COLLECTIONS.orders, order as unknown as Record<string, unknown>);
  await saveCart(cart, []);
  recordAudit({
    category: "order_routing",
    action: decision.routing === "submitted" ? "order.routed" : "order.manual_required",
    summary:
      decision.routing === "submitted"
        ? `Routed ${code} to ${decision.supplierName} automatically after payment`
        : `${code} flagged for manual supplier handling after payment`,
    storeId,
    agencyId: store.agencyId,
    actorId: "system",
    actorName: "Parcelith routing",
    entity: "order",
    entityId: code,
    meta: { total, currency, routing: decision.routing },
  });

  revalidatePath(`/s/${store.slug}/cart`);
  revalidatePath(`/app/stores/${storeId}/orders`);
  redirect(orderStatusUrl(store.slug, code, await signOrderToken(storeId, code), "&new=1"));
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
  const t = copyFor(store?.defaultLanguage);

  if (!code) return { status: "error", message: t.actions.enterOrderCode, field: "code" };
  if (!email) return { status: "error", message: t.actions.enterOrderEmail, field: "email" };

  const order = store ? await getOrderByCode(store.id, code) : null;
  if (!store || !order || !emailMatchesOrder(order.customer.email, email)) {
    return { status: "error", message: t.actions.lookupFailed };
  }

  redirect(orderStatusUrl(slug, order.code, await signOrderToken(store.id, order.code)));
}

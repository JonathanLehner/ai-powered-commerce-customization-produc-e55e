import "server-only";
import { emailCopy, shopperLocale } from "@/i18n/storefront";
import { COLLECTIONS, getStoreProductsByIds, recordAudit } from "./data";
import { sendEmail, siteOrigin } from "./email";
import { brandFor, checkoutRecoveryEmail } from "./email-templates";
import { db } from "./mongo";
import { hmac, safeEqual } from "./order-access";
import { RECOVERY_WINDOW_DAYS, recoveryDue, recoverySettings } from "./order-ops";
import { storeLinkBase } from "./seo";
import type { Cart, CartItem, Customer, Order, Store } from "./types";
import { newId } from "./util";

/**
 * Abandoned checkouts: Checkout sessions that expired unpaid with an email
 * address. A store can send each shopper one email, a set number of hours
 * later, with a link that puts the basket back. Only shoppers who agreed at
 * checkout to hear from the store are emailed, and not if they have opted out
 * since.
 */

export function listAbandonedCheckouts(storeId: string, limit = 200): Promise<Order[]> {
  return db.find<Order>(
    COLLECTIONS.orders,
    { storeId, "abandoned.at": { $type: "string" } },
    { sort: { "abandoned.at": -1 }, limit },
  );
}

export function signRecoveryToken(storeId: string, orderId: string): Promise<string> {
  return hmac(`recover:${storeId}:${orderId}`);
}

export async function verifyRecoveryToken(storeId: string, orderId: string, token: string | null): Promise<boolean> {
  if (!token) return false;
  return safeEqual(token, await signRecoveryToken(storeId, orderId));
}

/** `base` is the storefront in the shopper's language, absolute for an email. */
export function recoveryUrl(base: string, orderId: string, token: string): string {
  return `${base}/cart/restore?o=${encodeURIComponent(orderId)}&t=${token}`;
}

/** Whether the shopper turned marketing email off in their account after they checked out. */
async function optedOutSince(order: Order): Promise<boolean> {
  const customer = await db.findOne<Customer>(COLLECTIONS.customers, {
    storeId: order.storeId,
    email: order.customer.email.trim().toLowerCase(),
  });
  return Boolean(customer?.marketing && !customer.marketing.subscribed && customer.marketing.updatedAt > order.createdAt);
}

/**
 * Sends the recovery emails that are due, across every store that has them
 * turned on. Each checkout is claimed with a guarded write first, so it is
 * emailed once however many requests run this at the same moment.
 */
export async function sendDueRecoveryEmails(limit = 25): Promise<number> {
  const stores = await db.find<Store>(COLLECTIONS.stores, { "checkoutRecovery.enabled": true, status: "active" });
  if (stores.length === 0) return 0;
  const now = new Date();
  const since = new Date(now.getTime() - RECOVERY_WINDOW_DAYS * 86_400_000).toISOString();
  let sent = 0;
  for (const store of stores) {
    const settings = recoverySettings(store);
    const cutoff = new Date(now.getTime() - settings.delayHours * 3_600_000).toISOString();
    const candidates = await db.find<Order>(
      COLLECTIONS.orders,
      {
        storeId: store.id,
        marketingConsent: true,
        "abandoned.at": { $lte: cutoff, $gte: since },
        "abandoned.recoveryEmailAt": null,
        "abandoned.recoveredAt": null,
      },
      { sort: { "abandoned.at": 1 }, limit: limit - sent },
    );
    for (const order of candidates) {
      if (!recoveryDue(order, settings, now)) continue;
      if (await sendRecoveryEmail(store, order)) sent += 1;
    }
    if (sent >= limit) break;
  }
  return sent;
}

async function sendRecoveryEmail(store: Store, order: Order): Promise<boolean> {
  const at = new Date().toISOString();
  const claimed = await db.updateOne(
    COLLECTIONS.orders,
    { id: order.id, "abandoned.recoveryEmailAt": null, "abandoned.recoveredAt": null },
    { $set: { "abandoned.recoveryEmailAt": at } },
  );
  if (claimed.modifiedCount !== 1) return false;
  if (await optedOutSince(order)) {
    // Recorded as without consent, so it is not looked at again.
    await db.updateOne(
      COLLECTIONS.orders,
      { id: order.id },
      { $set: { marketingConsent: false, "abandoned.recoveryEmailAt": null } },
    );
    return false;
  }

  const locale = shopperLocale(store, order.locale ?? store.defaultLanguage);
  const origin = await siteOrigin();
  const base = storeLinkBase(store, locale, origin);
  sendEmail({
    to: order.customer.email,
    message: checkoutRecoveryEmail(brandFor(store), await emailCopy(locale), {
      customerName: order.customer.name,
      items: order.items.map((item) => ({ name: item.productName, variant: item.variantName, quantity: item.quantity })),
      restoreUrl: recoveryUrl(base, order.id, await signRecoveryToken(store.id, order.id)),
    }),
    kind: "checkout recovery",
    storeId: store.id,
    agencyId: store.agencyId,
    entity: "order",
    entityId: order.code,
  });
  recordAudit({
    category: "order_routing",
    action: "order.recovery_sent",
    summary: `Sent the abandoned checkout email for ${order.code}`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: "system",
    actorName: "Parcelith",
    entity: "order",
    entityId: order.code,
    meta: {},
  });
  return true;
}

/**
 * The basket an abandoned checkout held, for the shopper's session: the lines
 * whose product and variant are still on sale. Prices are worked out again on
 * the basket page, as for any basket.
 */
export async function restoredCartItems(order: Order): Promise<CartItem[]> {
  const products = await getStoreProductsByIds(order.items.map((item) => item.storeProductId));
  return order.items.flatMap((item): CartItem[] => {
    const product = products.get(item.storeProductId);
    const variant = product?.variants.find((v) => v.id === item.variantId);
    if (!product || product.status !== "published" || product.storeId !== order.storeId || !variant?.enabled) return [];
    return [
      {
        id: newId("cit"),
        storeProductId: item.storeProductId,
        variantId: item.variantId,
        productName: item.productName,
        variantName: item.variantName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        artworkUrl: item.customization.artworkUrl,
        artworkFileName: item.customization.artworkFileName,
        artworkPlacement: item.customization.artworkPlacement ?? null,
        text: item.customization.text,
        previewUrl: item.customization.previewUrl,
        previewOverlay: item.customization.previewOverlay ?? null,
      },
    ];
  });
}

/** Puts an abandoned checkout's lines into the shopper's basket, replacing what was there. */
export async function restoreCart(order: Order, sessionId: string): Promise<number> {
  const items = await restoredCartItems(order);
  const now = new Date().toISOString();
  const existing = await db.findOne<Cart>(COLLECTIONS.carts, { storeId: order.storeId, sessionId });
  if (existing) {
    await db.updateOne(
      COLLECTIONS.carts,
      { id: existing.id },
      { $set: { items, currency: order.currency, discountCode: null, giftCardCode: null, updatedAt: now } },
    );
  } else {
    const cart: Cart = { id: newId("crt"), storeId: order.storeId, sessionId, items, currency: order.currency, updatedAt: now };
    await db.insertOne(COLLECTIONS.carts, cart as unknown as Record<string, unknown>);
  }
  return items.length;
}

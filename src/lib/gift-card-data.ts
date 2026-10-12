import "server-only";
import { emailCopy, shopperLocale } from "@/i18n/storefront";
import { COLLECTIONS, getStoreProductsByIds, recordAudit } from "./data";
import { brandFor, giftCardEmail } from "./email-templates";
import { sendEmail } from "./email";
import { generateGiftCode, giftCodeLast4, normalizeGiftCode } from "./gift-cards";
import { db } from "./mongo";
import { storeUrl } from "./seo";
import type { GiftCard, GiftCardTransaction, Order, Store } from "./types";
import { formatMoney, newId } from "./util";

/**
 * Reads and guarded writes of a store's gift cards. The balance never moves
 * through a plain `$set`: every change is a conditional `$inc`, so two
 * checkouts spending one card at the same instant cannot take it below zero,
 * and a webhook delivered twice settles a hold once.
 */

export function getGiftCard(storeId: string, id: string) {
  return db.findOne<GiftCard>(COLLECTIONS.giftCards, { storeId, id });
}

export function getGiftCardByCode(storeId: string, code: string) {
  return db.findOne<GiftCard>(COLLECTIONS.giftCards, { storeId, code: normalizeGiftCode(code) });
}

export function listGiftCards(storeId: string) {
  return db.find<GiftCard>(COLLECTIONS.giftCards, { storeId }, { sort: { createdAt: -1, id: -1 }, limit: 500 });
}

function transaction(
  kind: GiftCardTransaction["kind"],
  amount: number,
  orderCode: string | null,
  actorName: string,
  note = "",
): GiftCardTransaction {
  return { id: newId("gct"), kind, amount, orderCode, note, actorName, at: new Date().toISOString() };
}

export type NewGiftCard = Omit<
  GiftCard,
  "id" | "code" | "last4" | "balance" | "holds" | "transactions" | "status" | "createdAt" | "updatedAt"
>;

/**
 * Writes a new card with a fresh code. A clash with an existing code (the
 * unique index refuses it) draws another one.
 */
export async function createGiftCard(input: NewGiftCard): Promise<GiftCard> {
  const now = new Date().toISOString();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateGiftCode();
    const card: GiftCard = {
      ...input,
      id: newId("gft"),
      code,
      last4: giftCodeLast4(code),
      balance: input.initialValue,
      status: "active",
      holds: [],
      transactions: [transaction("issued", input.initialValue, input.orderCode, input.createdBy)],
      createdAt: now,
      updatedAt: now,
    };
    try {
      await db.insertOne(COLLECTIONS.giftCards, card as unknown as Record<string, unknown>);
      return card;
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
  }
  throw new Error("No free gift card code could be drawn");
}

/** Holds `cardAmount` on the card for an order. False when the card is gone, off or short. */
export async function holdGiftCard(storeId: string, cardId: string, orderId: string, cardAmount: number): Promise<boolean> {
  const result = await db.updateOne(
    COLLECTIONS.giftCards,
    { storeId, id: cardId, status: "active", balance: { $gte: cardAmount }, "holds.orderId": { $ne: orderId } },
    {
      $inc: { balance: -cardAmount },
      $push: { holds: { orderId, amount: cardAmount } },
      $set: { updatedAt: new Date().toISOString() },
    },
  );
  return result.modifiedCount > 0;
}

/** Gives an unpaid order's hold back to the card. Runs once, however often it is called. */
export async function releaseGiftCardHold(order: Pick<Order, "id" | "storeId" | "code" | "giftCard">): Promise<boolean> {
  if (!order.giftCard) return false;
  const amount = order.giftCard.cardAmount;
  const result = await db.updateOne(
    COLLECTIONS.giftCards,
    { storeId: order.storeId, id: order.giftCard.cardId, "holds.orderId": order.id },
    {
      $inc: { balance: amount },
      $pull: { holds: { orderId: order.id } },
      $push: { transactions: transaction("released", amount, order.code, "Checkout") },
      $set: { updatedAt: new Date().toISOString() },
    },
  );
  return result.modifiedCount > 0;
}

/** Takes a paid order's hold off the card for good. Runs once, however often it is called. */
export async function commitGiftCardHold(order: Pick<Order, "id" | "storeId" | "code" | "giftCard">): Promise<boolean> {
  if (!order.giftCard) return false;
  const result = await db.updateOne(
    COLLECTIONS.giftCards,
    { storeId: order.storeId, id: order.giftCard.cardId, "holds.orderId": order.id },
    {
      $pull: { holds: { orderId: order.id } },
      $push: { transactions: transaction("redeemed", -order.giftCard.cardAmount, order.code, "Checkout") },
      $set: { updatedAt: new Date().toISOString() },
    },
  );
  return result.modifiedCount > 0;
}

/** Emails a card's code to its recipient, in `language`. Never throws. */
export async function sendGiftCard(store: Store, card: GiftCard, language: string | null | undefined): Promise<void> {
  try {
    const locale = shopperLocale(store, language ?? store.defaultLanguage);
    const copy = await emailCopy(locale);
    sendEmail({
      to: card.recipientEmail,
      message: giftCardEmail(brandFor(store), copy, {
        recipientName: card.recipientName,
        code: card.code,
        amount: card.initialValue,
        currency: card.currency,
        expires: card.expiresAt ? copy.format.dateTime(new Date(card.expiresAt), { dateStyle: "long" }) : null,
        note: card.note,
        shopUrl: storeUrl(store, locale),
      }),
      kind: "gift card",
      storeId: store.id,
      agencyId: store.agencyId,
      entity: "gift_card",
      entityId: card.id,
    });
  } catch (error) {
    console.error("Gift card email could not be queued", error);
  }
}

/** The lines of an order that are gift cards. */
export async function giftCardLineIds(order: Pick<Order, "items">): Promise<Set<string>> {
  const products = await getStoreProductsByIds(order.items.map((item) => item.storeProductId));
  return new Set(order.items.filter((item) => products.get(item.storeProductId)?.giftCard).map((item) => item.id));
}

/**
 * Issues a card for every gift card unit on a paid order and emails each code
 * to the buyer. Each unit has its own key, so a webhook delivered twice issues
 * nothing new. Returns the order lines that were gift cards.
 */
export async function issueOrderGiftCards(order: Order, store: Store): Promise<{ lineIds: string[]; issued: GiftCard[] }> {
  const products = await getStoreProductsByIds(order.items.map((item) => item.storeProductId));
  const lines = order.items.filter((item) => products.get(item.storeProductId)?.giftCard);
  const issued: GiftCard[] = [];
  for (const line of lines) {
    for (let unit = 0; unit < line.quantity; unit++) {
      const key = `${order.id}:${line.id}:${unit}`;
      if (await db.findOne<GiftCard>(COLLECTIONS.giftCards, { storeId: store.id, orderItemKey: key })) continue;
      const card = await createGiftCard({
        storeId: store.id,
        currency: order.currency,
        initialValue: line.unitPrice,
        source: "purchase",
        orderId: order.id,
        orderCode: order.code,
        orderItemKey: key,
        recipientEmail: order.customer.email,
        recipientName: order.customer.name,
        note: "",
        expiresAt: null,
        createdBy: "Shopper",
      });
      issued.push(card);
      await sendGiftCard(store, card, order.locale);
    }
  }
  if (issued.length > 0) {
    recordAudit({
      category: "discounts",
      action: "gift_card.issued",
      summary: `Issued ${issued.length} gift ${issued.length === 1 ? "card" : "cards"} for ${order.code}: ${issued
        .map((card) => formatMoney(card.initialValue, card.currency))
        .join(", ")}`,
      storeId: store.id,
      agencyId: store.agencyId,
      actorId: "system",
      actorName: "Shopper",
      entity: "order",
      entityId: order.code,
      meta: { count: issued.length },
    });
  }
  return { lineIds: lines.map((line) => line.id), issued };
}

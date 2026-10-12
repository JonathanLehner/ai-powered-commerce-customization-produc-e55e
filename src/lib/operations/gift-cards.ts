import "server-only";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { COLLECTIONS, getStoreProductBySlug, recordAudit } from "../data";
import { createGiftCard, getGiftCard, sendGiftCard } from "../gift-card-data";
import { cleanDenominations, GIFT_CARD_IMAGE, GIFT_CARD_LIMITS } from "../gift-cards";
import { db } from "../mongo";
import { baseStoreSku } from "../sku";
import type { GiftCard, StoreProduct, StoreVariant } from "../types";
import { formatMoney, newId } from "../util";
import { OperationError, type OperationContext } from "./context";

/**
 * Gift cards issued by hand, their status, and the gift card product a store
 * sells. The workspace's gift card actions and the Admin API both run these.
 */

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function audit(ctx: OperationContext, action: string, summary: string, entityId: string, meta: Record<string, string | number> = {}) {
  recordAudit({
    category: "discounts",
    action,
    summary,
    storeId: ctx.store.id,
    agencyId: ctx.store.agencyId,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "gift_card",
    entityId,
    meta,
  });
}

function revalidateGiftCards(ctx: OperationContext) {
  revalidatePath(`/app/stores/${ctx.store.id}/gift-cards`);
}

async function copy(ctx: OperationContext) {
  return getTranslations({ locale: ctx.locale, namespace: "actions.giftCards" });
}

export async function findGiftCard(storeId: string, cardId: string): Promise<GiftCard | null> {
  return getGiftCard(storeId, cardId);
}

export interface IssueInput {
  /** Minor units of `currency`. */
  amount: number;
  currency: string;
  recipientEmail: string;
  recipientName: string;
  note: string;
  /** YYYY-MM-DD, or null for no expiry. */
  expiresOn: string | null;
  /** Email the code to the recipient. */
  send: boolean;
  submissionKey: string | null;
}

function expiryOf(day: string | null): string | null {
  return day ? new Date(`${day}T23:59:59.999Z`).toISOString() : null;
}

/** Issues a card by hand, as a goodwill gesture or a prize. A resubmitted form gets back the card it made. */
export async function issueGiftCard(ctx: OperationContext, input: IssueInput): Promise<GiftCard> {
  const t = await copy(ctx);
  if (!Number.isInteger(input.amount) || input.amount < GIFT_CARD_LIMITS.minValue || input.amount > GIFT_CARD_LIMITS.maxValue) {
    throw new OperationError(
      "invalid",
      t("amountRange", {
        min: formatMoney(GIFT_CARD_LIMITS.minValue, input.currency),
        max: formatMoney(GIFT_CARD_LIMITS.maxValue, input.currency),
      }),
      "amount",
    );
  }
  if (!ctx.store.currencies.includes(input.currency)) throw new OperationError("invalid", t("currencyInvalid"), "currency");
  const recipientEmail = input.recipientEmail.trim().toLowerCase();
  if (recipientEmail && !EMAIL.test(recipientEmail)) throw new OperationError("invalid", t("emailInvalid"), "recipientEmail");
  if (input.send && !recipientEmail) throw new OperationError("invalid", t("emailRequired"), "recipientEmail");
  if (input.note.length > GIFT_CARD_LIMITS.note) throw new OperationError("invalid", t("noteTooLong"), "note");
  if (input.expiresOn && (!/^\d{4}-\d{2}-\d{2}$/.test(input.expiresOn) || new Date(`${input.expiresOn}T23:59:59Z`) < new Date())) {
    throw new OperationError("invalid", t("expiryInvalid"), "expiresOn");
  }

  if (input.submissionKey) {
    const already = await db.findOne<GiftCard>(COLLECTIONS.giftCards, {
      storeId: ctx.store.id,
      submissionKey: input.submissionKey,
    });
    if (already) return already;
  }

  const card = await createGiftCard({
    storeId: ctx.store.id,
    currency: input.currency,
    initialValue: input.amount,
    source: "manual",
    orderId: null,
    orderCode: null,
    orderItemKey: null,
    recipientEmail,
    recipientName: input.recipientName.trim(),
    note: input.note.trim(),
    expiresAt: expiryOf(input.expiresOn),
    createdBy: ctx.actor.name,
    submissionKey: input.submissionKey,
  });
  if (input.send) await sendGiftCard(ctx.store, card, ctx.store.defaultLanguage);
  audit(
    ctx,
    "gift_card.issued",
    `Issued a ${formatMoney(card.initialValue, card.currency)} gift card ending ${card.last4}${recipientEmail ? ` to ${recipientEmail}` : ""}`,
    card.id,
    { amount: card.initialValue },
  );
  revalidateGiftCards(ctx);
  return card;
}

/** Turns a card off or on again, and changes its note or expiry. */
export async function updateGiftCard(
  ctx: OperationContext,
  card: GiftCard,
  input: { status?: GiftCard["status"]; note?: string; expiresOn?: string | null },
): Promise<GiftCard> {
  const t = await copy(ctx);
  const patch: Partial<GiftCard> = {};
  if (input.status && input.status !== card.status) patch.status = input.status;
  if (input.note !== undefined) {
    if (input.note.length > GIFT_CARD_LIMITS.note) throw new OperationError("invalid", t("noteTooLong"), "note");
    patch.note = input.note.trim();
  }
  if (input.expiresOn !== undefined) {
    if (input.expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(input.expiresOn)) {
      throw new OperationError("invalid", t("expiryInvalid"), "expiresOn");
    }
    patch.expiresAt = expiryOf(input.expiresOn);
  }
  if (Object.keys(patch).length === 0) return card;
  const now = new Date().toISOString();
  await db.updateOne(COLLECTIONS.giftCards, { storeId: ctx.store.id, id: card.id }, { $set: { ...patch, updatedAt: now } });
  if (patch.status) {
    audit(
      ctx,
      patch.status === "disabled" ? "gift_card.disabled" : "gift_card.enabled",
      `${patch.status === "disabled" ? "Disabled" : "Enabled"} the gift card ending ${card.last4}`,
      card.id,
    );
  } else audit(ctx, "gift_card.updated", `Edited the gift card ending ${card.last4}`, card.id);
  revalidateGiftCards(ctx);
  return { ...card, ...patch, updatedAt: now };
}

/* ------------------------------------------------------- the product it sells */

/** The store's gift card product, if it has made one. */
export function findGiftCardProduct(storeId: string): Promise<StoreProduct | null> {
  return db.findOne<StoreProduct>(COLLECTIONS.storeProducts, { storeId, giftCard: true });
}

export interface GiftCardProductInput {
  name: string;
  description: string;
  /** Minor units of the store's default currency. */
  denominations: number[];
  published: boolean;
}

function denominationVariant(amount: number, currency: string, existing: StoreVariant | undefined): StoreVariant {
  const name = formatMoney(amount, currency);
  return {
    id: existing?.id ?? newId("svar"),
    catalogVariantId: "gift-card",
    name,
    colour: "",
    colourHex: "",
    size: name,
    sku: `GIFT-${amount}`,
    baseCost: 0,
    price: amount,
    enabled: true,
    availability: "in_stock",
    weightGrams: 0,
  };
}

/**
 * Creates or updates the gift card product: one variant per denomination, in
 * the store's default currency, sold with no tax and no supplier.
 */
export async function saveGiftCardProduct(ctx: OperationContext, input: GiftCardProductInput): Promise<StoreProduct> {
  const t = await copy(ctx);
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) throw new OperationError("invalid", t("productNameInvalid"), "name");
  if (input.description.length > 2000) throw new OperationError("invalid", t("productDescriptionTooLong"), "description");
  const denominations = cleanDenominations(input.denominations);
  if (denominations.length === 0) throw new OperationError("invalid", t("denominationsRequired"), "denominations");

  const currency = ctx.store.defaultCurrency;
  const existing = await findGiftCardProduct(ctx.store.id);
  const now = new Date().toISOString();
  const variants = denominations.map((amount) =>
    denominationVariant(amount, currency, existing?.variants.find((v) => v.price === amount)),
  );
  const status: StoreProduct["status"] = input.published ? "published" : "draft";

  if (existing) {
    const patch: Partial<StoreProduct> = {
      name,
      description: input.description.trim(),
      variants,
      price: variants[0].price,
      currency,
      status,
      publishedAt: input.published ? (existing.publishedAt ?? now) : existing.publishedAt,
      updatedAt: now,
    };
    await db.updateOne(COLLECTIONS.storeProducts, { storeId: ctx.store.id, id: existing.id }, { $set: patch });
    audit(ctx, "gift_card.product_saved", `Saved the gift card product “${name}”`, existing.id);
    revalidateGiftCards(ctx);
    revalidatePath(`/s/${ctx.store.slug}`, "layout");
    return { ...existing, ...patch };
  }

  let slug = "gift-card";
  for (let n = 2; await getStoreProductBySlug(ctx.store.id, slug); n++) slug = `gift-card-${n}`;
  const product: StoreProduct = {
    id: newId("prd"),
    storeId: ctx.store.id,
    catalogProductId: "gift-card",
    supplierId: "",
    name,
    slug,
    sku: baseStoreSku(ctx.store.channelCode, "Gift card"),
    description: input.description.trim(),
    tags: [],
    category: "apparel",
    status,
    visibility: "public",
    price: variants[0].price,
    currency,
    taxBracketId: null,
    variants,
    artworks: [],
    mockups: [
      {
        id: newId("mck"),
        view: "front",
        url: GIFT_CARD_IMAGE,
        shareUrl: GIFT_CARD_IMAGE,
        colour: "",
        generatedAt: now,
        approved: true,
        approvedBy: ctx.actor.name,
        approvedAt: now,
      },
    ],
    shopperCustomization: { artworkUpload: false, textLine: false, textLabel: "", maxTextLength: 0 },
    costs: {
      supplierCost: 0,
      customizationCost: 0,
      shippingEstimate: 0,
      taxBracketId: null,
      taxRate: 0,
      taxAmount: 0,
      sellingPrice: variants[0].price,
      marginAmount: variants[0].price,
      marginPct: 100,
      currency,
    },
    translations: {},
    giftCard: true,
    importedBy: ctx.actor.name,
    importedAt: now,
    updatedAt: now,
    publishedAt: input.published ? now : null,
  };
  await db.insertOne(COLLECTIONS.storeProducts, product as unknown as Record<string, unknown>);
  audit(ctx, "gift_card.product_created", `Created the gift card product “${name}”`, product.id);
  revalidateGiftCards(ctx);
  revalidatePath(`/app/stores/${ctx.store.id}/catalog`);
  revalidatePath(`/s/${ctx.store.slug}`, "layout");
  return product;
}

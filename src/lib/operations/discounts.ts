import "server-only";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { createDiscountCode, getDiscountCode, getDiscountCodeByCode, recordAudit, updateDiscountCode } from "../data";
import { MAX_DISCOUNT_PERCENTAGE, normalizeDiscountCode } from "../discounts";
import type { DiscountCode, DiscountKind } from "../types";
import { formatMoney, newId } from "../util";
import { OperationError, type OperationContext } from "./context";

/**
 * A store's discount codes. The workspace's discount forms and the Admin API
 * both run these, so a code's terms are checked the same way wherever it is
 * written: its value is money.
 */

/** The terms as entered. A number that could not be read is null or NaN. */
export interface DiscountTermsInput {
  kind: DiscountKind;
  /** Whole percent, or minor units of the store's currency. */
  value: number | null;
  /** Minor units; 0 for no minimum. */
  minimumSubtotal: number | null;
  /** `YYYY-MM-DD`, or null for no expiry. */
  expiresAt: string | null;
  /** Null for no limit. */
  usageLimit: number | null;
  active: boolean;
}

export interface DiscountTerms {
  kind: DiscountKind;
  value: number;
  minimumSubtotal: number;
  expiresAt: string | null;
  usageLimit: number | null;
  active: boolean;
}

/** What a code is worth, in the words the workspace uses for it. */
function worthLabel(kind: DiscountKind, value: number, currency: string): string {
  return kind === "percentage" ? `${value}% off` : `${formatMoney(value, currency)} off`;
}

async function checkTerms(ctx: OperationContext, input: DiscountTermsInput): Promise<DiscountTerms> {
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.discounts" });
  const kind: DiscountKind = input.kind === "fixed" ? "fixed" : "percentage";
  const value = input.value;
  if (kind === "percentage") {
    if (value === null || !Number.isInteger(value) || value < 1 || value > MAX_DISCOUNT_PERCENTAGE) {
      throw new OperationError("invalid", t("percentRange", { max: MAX_DISCOUNT_PERCENTAGE }), "value");
    }
  } else if (value === null || !Number.isInteger(value) || value <= 0) {
    throw new OperationError("invalid", t("amountRequired", { currency: ctx.store.defaultCurrency }), "value");
  }

  const minimumSubtotal = input.minimumSubtotal;
  if (minimumSubtotal === null || !Number.isInteger(minimumSubtotal) || minimumSubtotal < 0) {
    throw new OperationError("invalid", t("minimumInvalid"), "minimumSubtotal");
  }

  const expiresAt = input.expiresAt;
  if (expiresAt !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(expiresAt) || Number.isNaN(Date.parse(expiresAt)))) {
    throw new OperationError("invalid", t("expiryInvalid"), "expiresAt");
  }

  const usageLimit = input.usageLimit;
  if (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 1)) {
    throw new OperationError("invalid", t("limitInvalid"), "usageLimit");
  }

  return { kind, value, minimumSubtotal, expiresAt, usageLimit, active: input.active };
}

function revalidateDiscounts(ctx: OperationContext) {
  revalidatePath(`/app/stores/${ctx.store.id}/discounts`);
  // A code that is switched off or reworded has to stop applying to the baskets
  // already holding it, so the two storefront pages that price it are dropped.
  revalidatePath(`/s/${ctx.store.slug}/cart`);
  revalidatePath(`/s/${ctx.store.slug}/checkout`);
}

function auditMeta(code: string, terms: DiscountTerms) {
  return {
    code,
    kind: terms.kind,
    value: terms.value,
    minimumSubtotal: terms.minimumSubtotal,
    expiresAt: terms.expiresAt,
    usageLimit: terms.usageLimit,
    active: terms.active,
  };
}

/** The code, provided it belongs to the store. */
export async function findDiscount(storeId: string, discountId: string): Promise<DiscountCode | null> {
  const code = await getDiscountCode(discountId);
  return code && code.storeId === storeId ? code : null;
}

export async function createDiscount(
  ctx: OperationContext,
  rawCode: string,
  input: DiscountTermsInput,
): Promise<DiscountCode> {
  const { store, actor } = ctx;
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.discounts" });
  const code = normalizeDiscountCode(rawCode);
  if (code.length < 3) throw new OperationError("invalid", t("codeTooShort"), "code");

  const terms = await checkTerms(ctx, input);

  // Codes are looked up by store and code, so a store cannot hold two of the
  // same: the second would be unreachable.
  if (await getDiscountCodeByCode(store.id, code)) {
    throw new OperationError("conflict", t("exists", { code }), "code");
  }

  const now = new Date().toISOString();
  const record: DiscountCode = {
    id: newId("dsc"),
    storeId: store.id,
    code,
    currency: store.defaultCurrency,
    timesUsed: 0,
    createdBy: actor.name,
    createdAt: now,
    updatedAt: now,
    ...terms,
  };
  await createDiscountCode(record);

  recordAudit({
    category: "discounts",
    action: "discount.created",
    summary: `Created discount code ${code}: ${worthLabel(terms.kind, terms.value, store.defaultCurrency)}`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: actor.id,
    actorName: actor.name,
    entity: "discount_code",
    entityId: record.id,
    meta: auditMeta(code, terms),
  });
  revalidateDiscounts(ctx);
  return record;
}

export async function updateDiscount(
  ctx: OperationContext,
  existing: DiscountCode,
  input: DiscountTermsInput,
): Promise<DiscountCode> {
  const { store, actor } = ctx;
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.discounts" });
  const terms = await checkTerms(ctx, input);

  if (terms.usageLimit !== null && terms.usageLimit < existing.timesUsed) {
    throw new OperationError(
      "invalid",
      t("limitBelowUsed", { code: existing.code, count: existing.timesUsed }),
      "usageLimit",
    );
  }

  // Guarded on the usage count, like every other write to a code: an edit saved
  // while a shopper is paying must not roll their redemption back.
  const saved = await updateDiscountCode(existing.id, { timesUsed: existing.timesUsed }, terms);
  if (!saved) throw new OperationError("conflict", t("changed"));

  const changes = describeChanges(existing, terms, store.defaultCurrency);
  recordAudit({
    category: "discounts",
    action: "discount.updated",
    summary:
      changes.length > 0
        ? `Changed discount code ${existing.code}: ${changes.join(", ")}`
        : `Saved discount code ${existing.code} with no changes`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: actor.id,
    actorName: actor.name,
    entity: "discount_code",
    entityId: existing.id,
    meta: auditMeta(existing.code, terms),
  });
  revalidateDiscounts(ctx);
  return { ...existing, ...terms, updatedAt: new Date().toISOString() };
}

/** What actually changed, so the audit entry reads as a change rather than a dump. */
function describeChanges(before: DiscountCode, after: DiscountTerms, currency: string): string[] {
  const changes: string[] = [];
  if (before.kind !== after.kind || before.value !== after.value) {
    changes.push(
      `worth ${worthLabel(before.kind, before.value, currency)} → ${worthLabel(after.kind, after.value, currency)}`,
    );
  }
  if (before.minimumSubtotal !== after.minimumSubtotal) {
    changes.push(
      `minimum basket ${before.minimumSubtotal === 0 ? "none" : formatMoney(before.minimumSubtotal, currency)} → ${
        after.minimumSubtotal === 0 ? "none" : formatMoney(after.minimumSubtotal, currency)
      }`,
    );
  }
  if ((before.expiresAt ?? null) !== after.expiresAt) {
    changes.push(`expiry ${before.expiresAt ?? "none"} → ${after.expiresAt ?? "none"}`);
  }
  if ((before.usageLimit ?? null) !== after.usageLimit) {
    changes.push(`usage limit ${before.usageLimit ?? "none"} → ${after.usageLimit ?? "none"}`);
  }
  if (before.active !== after.active) changes.push(after.active ? "switched on" : "switched off");
  return changes;
}

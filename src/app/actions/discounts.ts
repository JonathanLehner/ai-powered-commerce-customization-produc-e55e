"use server";

import { revalidatePath } from "next/cache";
import {
  createDiscountCode,
  getDiscountCode,
  getDiscountCodeByCode,
  recordAudit,
  updateDiscountCode,
} from "@/lib/data";
import {
  MAX_DISCOUNT_PERCENTAGE,
  normalizeDiscountCode,
} from "@/lib/discounts";
import { assertStoreAccess } from "@/lib/session";
import type { DiscountCode, DiscountKind, Store } from "@/lib/types";
import { formatMoney, newId, parseMoney } from "@/lib/util";
import type { ActionState } from "./stores";

function fail(message: string, field?: string): ActionState {
  return { status: "error", message, field };
}

/** What a code is worth, in the words the workspace uses for it. */
function worthLabel(kind: DiscountKind, value: number, currency: string): string {
  return kind === "percentage" ? `${value}% off` : `${formatMoney(value, currency)} off`;
}

interface Terms {
  kind: DiscountKind;
  value: number;
  minimumSubtotal: number;
  expiresAt: string | null;
  usageLimit: number | null;
  active: boolean;
}

/**
 * The fields both the create and the edit form post. Everything is checked here
 * rather than in the browser, because a code's value is money.
 */
function readTerms(formData: FormData, store: Store): Terms | ActionState {
  const kind: DiscountKind = String(formData.get("kind") ?? "percentage") === "fixed" ? "fixed" : "percentage";
  const rawValue = String(formData.get("value") ?? "").trim();

  let value: number;
  if (kind === "percentage") {
    const percent = Number(rawValue);
    if (!Number.isInteger(percent) || percent < 1 || percent > MAX_DISCOUNT_PERCENTAGE) {
      return fail(`Enter a whole percentage between 1 and ${MAX_DISCOUNT_PERCENTAGE}.`, "value");
    }
    value = percent;
  } else {
    const amount = parseMoney(rawValue, store.defaultCurrency);
    if (amount === null || amount <= 0) {
      return fail(`Enter the amount to take off in ${store.defaultCurrency}.`, "value");
    }
    value = amount;
  }

  const rawMinimum = String(formData.get("minimumSubtotal") ?? "").trim();
  const minimumSubtotal = rawMinimum === "" ? 0 : parseMoney(rawMinimum, store.defaultCurrency);
  if (minimumSubtotal === null) {
    return fail("Enter a minimum basket value, or leave it empty for none.", "minimumSubtotal");
  }

  const rawExpiry = String(formData.get("expiresAt") ?? "").trim();
  let expiresAt: string | null = null;
  if (rawExpiry !== "") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawExpiry) || Number.isNaN(Date.parse(rawExpiry))) {
      return fail("Enter the expiry date as a date, or leave it empty.", "expiresAt");
    }
    expiresAt = rawExpiry;
  }

  const rawLimit = String(formData.get("usageLimit") ?? "").trim();
  let usageLimit: number | null = null;
  if (rawLimit !== "") {
    const limit = Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1) {
      return fail("Enter a usage limit of 1 or more, or leave it empty for no limit.", "usageLimit");
    }
    usageLimit = limit;
  }

  return {
    kind,
    value,
    minimumSubtotal,
    expiresAt,
    usageLimit,
    active: formData.get("active") !== null,
  };
}

function isActionState(value: Terms | ActionState): value is ActionState {
  return "status" in value;
}

function refresh(storeId: string, slug: string) {
  revalidatePath(`/app/stores/${storeId}/discounts`);
  // A code that is switched off or reworded has to stop applying to the baskets
  // already holding it, so the two storefront pages that price it are dropped.
  revalidatePath(`/s/${slug}/cart`);
  revalidatePath(`/s/${slug}/checkout`);
}

export async function createDiscount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const { user, store } = await assertStoreAccess(storeId, "store.settings");

  const code = normalizeDiscountCode(String(formData.get("code") ?? ""));
  if (code.length < 3) return fail("A code needs at least 3 letters or digits.", "code");

  const terms = readTerms(formData, store);
  if (isActionState(terms)) return terms;

  // Codes are looked up by store and code, so a store cannot hold two of the
  // same — the second would be unreachable.
  if (await getDiscountCodeByCode(storeId, code)) {
    return fail(`${code} already exists in this store.`, "code");
  }

  const now = new Date().toISOString();
  const record: DiscountCode = {
    id: newId("dsc"),
    storeId,
    code,
    currency: store.defaultCurrency,
    timesUsed: 0,
    createdBy: user.name,
    createdAt: now,
    updatedAt: now,
    ...terms,
  };
  await createDiscountCode(record);

  recordAudit({
    category: "discounts",
    action: "discount.created",
    summary: `Created discount code ${code} — ${worthLabel(terms.kind, terms.value, store.defaultCurrency)}`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "discount_code",
    entityId: record.id,
    meta: {
      code,
      kind: terms.kind,
      value: terms.value,
      minimumSubtotal: terms.minimumSubtotal,
      expiresAt: terms.expiresAt,
      usageLimit: terms.usageLimit,
      active: terms.active,
    },
  });
  refresh(storeId, store.slug);
  return { status: "success", message: `${code} is ready to hand out.` };
}

export async function saveDiscount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const discountId = String(formData.get("discountId") ?? "");
  const { user, store } = await assertStoreAccess(storeId, "store.settings");

  const existing = await getDiscountCode(discountId);
  if (!existing || existing.storeId !== storeId) return fail("That discount code no longer exists.");

  const terms = readTerms(formData, store);
  if (isActionState(terms)) return terms;

  if (terms.usageLimit !== null && terms.usageLimit < existing.timesUsed) {
    return fail(
      `${existing.code} has already been used ${existing.timesUsed} times, so the limit cannot be lower than that.`,
      "usageLimit",
    );
  }

  // Guarded on the usage count, like every other write to a code: an edit saved
  // while a shopper is paying must not roll their redemption back.
  const saved = await updateDiscountCode(discountId, { timesUsed: existing.timesUsed }, terms);
  if (!saved) {
    return fail("The code was used while this was being saved. Reload the page and try again.");
  }

  const changes = describeChanges(existing, terms, store.defaultCurrency);
  recordAudit({
    category: "discounts",
    action: "discount.updated",
    summary:
      changes.length > 0
        ? `Changed discount code ${existing.code}: ${changes.join(", ")}`
        : `Saved discount code ${existing.code} with no changes`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "discount_code",
    entityId: discountId,
    meta: {
      code: existing.code,
      kind: terms.kind,
      value: terms.value,
      minimumSubtotal: terms.minimumSubtotal,
      expiresAt: terms.expiresAt,
      usageLimit: terms.usageLimit,
      active: terms.active,
    },
  });
  refresh(storeId, store.slug);
  return { status: "success", message: `${existing.code} saved.` };
}

/** What actually changed, so the audit entry reads as a change rather than a dump. */
function describeChanges(before: DiscountCode, after: Terms, currency: string): string[] {
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

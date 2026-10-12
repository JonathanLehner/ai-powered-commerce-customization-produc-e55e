"use server";

import { getTranslations } from "next-intl/server";
import { refusal } from "@/lib/operations/action-state";
import {
  createDiscount as addDiscount,
  findDiscount,
  updateDiscount,
  type DiscountTermsInput,
} from "@/lib/operations/discounts";
import { assertStoreAccess, operationContext } from "@/lib/session";
import type { DiscountKind, Store } from "@/lib/types";
import { parseMoney } from "@/lib/util";
import type { ActionState } from "./stores";

/**
 * The terms both the create and the edit form post, read off the form. The
 * operation checks them: a code's value is money.
 */
function readTerms(formData: FormData, store: Store): DiscountTermsInput {
  const kind: DiscountKind = String(formData.get("kind") ?? "percentage") === "fixed" ? "fixed" : "percentage";
  const rawValue = String(formData.get("value") ?? "").trim();
  const rawMinimum = String(formData.get("minimumSubtotal") ?? "").trim();
  const rawExpiry = String(formData.get("expiresAt") ?? "").trim();
  const rawLimit = String(formData.get("usageLimit") ?? "").trim();
  return {
    kind,
    value: kind === "percentage" ? Number(rawValue) : parseMoney(rawValue, store.defaultCurrency),
    minimumSubtotal: rawMinimum === "" ? 0 : parseMoney(rawMinimum, store.defaultCurrency),
    expiresAt: rawExpiry === "" ? null : rawExpiry,
    usageLimit: rawLimit === "" ? null : Number(rawLimit),
    active: formData.get("active") !== null,
  };
}

export async function createDiscount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, "store.settings");
  const t = await getTranslations("actions.discounts");

  try {
    const record = await addDiscount(
      await operationContext(access),
      String(formData.get("code") ?? ""),
      readTerms(formData, access.store),
    );
    return { status: "success", message: t("created", { code: record.code }) };
  } catch (error) {
    return refusal(error);
  }
}

export async function saveDiscount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const discountId = String(formData.get("discountId") ?? "");
  const access = await assertStoreAccess(storeId, "store.settings");
  const t = await getTranslations("actions.discounts");

  const existing = await findDiscount(storeId, discountId);
  if (!existing) return { status: "error", message: t("gone") };

  try {
    await updateDiscount(await operationContext(access), existing, readTerms(formData, access.store));
    return { status: "success", message: t("saved", { code: existing.code }) };
  } catch (error) {
    return refusal(error);
  }
}

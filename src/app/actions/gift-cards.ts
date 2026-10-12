"use server";

import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { refusal } from "@/lib/operations/action-state";
import { findGiftCard, issueGiftCard as issueCard, saveGiftCardProduct, updateGiftCard } from "@/lib/operations/gift-cards";
import { assertStoreAccess, operationContext } from "@/lib/session";
import { parseMoney } from "@/lib/util";
import type { ActionState } from "./stores";

/** Gift cards are money the store owes: whoever manages discounts and settings manages them. */
const CAPABILITY = "store.settings";

export async function issueGiftCard(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, CAPABILITY);
  const currency = String(formData.get("currency") ?? access.store.defaultCurrency);
  let cardId: string;
  try {
    const card = await issueCard(await operationContext(access), {
      amount: parseMoney(String(formData.get("amount") ?? ""), currency) ?? Number.NaN,
      currency,
      recipientEmail: String(formData.get("recipientEmail") ?? ""),
      recipientName: String(formData.get("recipientName") ?? ""),
      note: String(formData.get("note") ?? ""),
      expiresOn: String(formData.get("expiresOn") ?? "") || null,
      send: formData.get("send") !== null,
      submissionKey: String(formData.get("submissionKey") ?? "") || null,
    });
    cardId = card.id;
  } catch (error) {
    return refusal(error);
  }
  redirect(`/app/stores/${storeId}/gift-cards?issued=${cardId}#${cardId}`);
}

export async function setGiftCardStatus(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, CAPABILITY);
  const card = await findGiftCard(storeId, String(formData.get("cardId") ?? ""));
  const status = formData.get("status") === "disabled" ? "disabled" : "active";
  if (card) await updateGiftCard(await operationContext(access), card, { status });
}

export async function saveGiftCardSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, CAPABILITY);
  const t = await getTranslations("actions.giftCards");
  const currency = access.store.defaultCurrency;
  const denominations = String(formData.get("denominations") ?? "")
    .split(/[;\s]+/)
    .filter(Boolean)
    .map((value) => parseMoney(value, currency));
  if (denominations.some((value) => value === null)) {
    return { status: "error", message: t("denominationsInvalid"), field: "denominations" };
  }
  try {
    const product = await saveGiftCardProduct(await operationContext(access), {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      denominations: denominations as number[],
      published: formData.get("published") !== null,
    });
    return { status: "success", message: product.status === "published" ? t("productLive") : t("productHidden") };
  } catch (error) {
    return refusal(error);
  }
}

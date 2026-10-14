"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { DEFAULT_LOCALE } from "@/i18n/locales";
import { shopperLocale, shopperTranslator } from "@/i18n/storefront";
import { getStore } from "@/lib/data";
import { submitReview as recordShopperReview } from "@/lib/operations/shop";
import type { ActionState } from "./stores";

/**
 * A verified buyer's review. The order page only shows the form behind the
 * order's signed link, and the shared operation checks that link again, along
 * with the order having been delivered and the product being on it.
 */
export async function submitReview(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const store = await getStore(String(formData.get("storeId") ?? ""));
  const locale = store ? shopperLocale(store, await getLocale()) : DEFAULT_LOCALE;
  const t = store ? await shopperTranslator(store, locale) : await getTranslations({ locale, namespace: "storefront" });
  const result = await recordShopperReview(store, { t, locale }, {
    code: String(formData.get("code") ?? ""),
    token: String(formData.get("token") ?? ""),
    productId: String(formData.get("productId") ?? ""),
    rating: Number(formData.get("rating") ?? 0),
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    authorName: String(formData.get("authorName") ?? ""),
  });
  return result.status === "error" ? { status: "error", message: result.message, ...(result.field ? { field: result.field } : {}) } : result;
}

"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { DEFAULT_LOCALE } from "@/i18n/locales";
import { shopperLocale, shopperTranslator } from "@/i18n/storefront";
import { getOrderByCode, getStore, getStoreProductsByIds } from "@/lib/data";
import { verifyOrderToken } from "@/lib/order-access";
import { recordReview } from "@/lib/review-data";
import { reviewableItems, reviewProblem } from "@/lib/reviews";
import type { ActionState } from "./stores";

/**
 * A verified buyer's review. The order page only shows the form behind the
 * order's signed link, and the action checks that link again, along with the
 * order having been delivered and the product being on it.
 */
export async function submitReview(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const store = await getStore(String(formData.get("storeId") ?? ""));
  const locale = store ? shopperLocale(store, await getLocale()) : DEFAULT_LOCALE;
  const t = store ? await shopperTranslator(store, locale) : await getTranslations({ locale, namespace: "storefront" });
  const code = String(formData.get("code") ?? "");
  const token = String(formData.get("token") ?? "");
  const productId = String(formData.get("productId") ?? "");
  if (!store || !(await verifyOrderToken(store.id, code, token))) {
    return { status: "error", message: t("reviews.notAllowed") };
  }
  const order = await getOrderByCode(store.id, code);
  if (!order) return { status: "error", message: t("reviews.notAllowed") };
  const products = await getStoreProductsByIds(order.items.map((item) => item.storeProductId));
  const giftCards = new Set([...products.values()].filter((p) => p.giftCard).map((p) => p.id));
  const item = reviewableItems(order, giftCards).find((entry) => entry.productId === productId);
  if (!item) return { status: "error", message: t("reviews.notAllowed") };

  const input = {
    rating: Number(formData.get("rating") ?? 0),
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    authorName: String(formData.get("authorName") ?? ""),
  };
  const problem = reviewProblem(input);
  if (problem) return { status: "error", message: t(`reviews.${problem.problem}`), field: problem.field };

  await recordReview(store, order, item, input, locale);
  revalidatePath(`/s/${store.slug}`, "layout");
  return { status: "success", message: t("reviews.thanks") };
}

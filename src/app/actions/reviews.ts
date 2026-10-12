"use server";

import { deleteReview as removeReview, findReview, moderateReview as setStatus } from "@/lib/operations/reviews";
import { isReviewStatus } from "@/lib/reviews";
import { assertStoreAccess, operationContext } from "@/lib/session";

/** Reviews sit on product pages: whoever manages the catalog moderates them. */
const CAPABILITY = "store.catalog";

export async function moderateReview(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, CAPABILITY);
  const status = formData.get("status");
  const review = await findReview(storeId, String(formData.get("reviewId") ?? ""));
  if (review && isReviewStatus(status)) await setStatus(await operationContext(access), review, status);
}

export async function deleteReview(formData: FormData): Promise<void> {
  const storeId = String(formData.get("storeId") ?? "");
  const access = await assertStoreAccess(storeId, CAPABILITY);
  const review = await findReview(storeId, String(formData.get("reviewId") ?? ""));
  if (review) await removeReview(await operationContext(access), review);
}

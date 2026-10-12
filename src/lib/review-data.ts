import "server-only";
import { COLLECTIONS, recordAudit } from "./data";
import { db } from "./mongo";
import { ratingSummary, type RatingSummary, type ReviewInput } from "./reviews";
import type { Order, ProductReview, ReviewStatus, Store } from "./types";
import { newId } from "./util";

/** Reads and writes of a store's product reviews. Every read is scoped to one store. */

export function getReview(storeId: string, id: string) {
  return db.findOne<ProductReview>(COLLECTIONS.reviews, { storeId, id });
}

export function listReviews(storeId: string, status?: ReviewStatus) {
  return db.find<ProductReview>(
    COLLECTIONS.reviews,
    { storeId, ...(status ? { status } : {}) },
    { sort: { createdAt: -1, id: -1 }, limit: 500 },
  );
}

/** The reviews shoppers see on a product page, newest first. */
export function listApprovedReviews(storeId: string, productId: string, limit = 20) {
  return db.find<ProductReview>(
    COLLECTIONS.reviews,
    { storeId, productId, status: "approved" },
    { sort: { createdAt: -1, id: -1 }, limit },
  );
}

/** The aggregate rating of a product's approved reviews, in one read. */
export async function productRating(storeId: string, productId: string): Promise<RatingSummary> {
  const rows = await db.aggregate<{ _id: number; count: number }>(COLLECTIONS.reviews, [
    { $match: { storeId, productId, status: "approved" } },
    { $group: { _id: "$rating", count: { $sum: 1 } } },
  ]);
  return ratingSummary(
    rows.flatMap((row) => Array.from({ length: row.count }, () => ({ rating: row._id, status: "approved" as const }))),
  );
}

/** The reviews already written for an order's products. */
export function reviewsForOrder(storeId: string, orderId: string) {
  return db.find<ProductReview>(COLLECTIONS.reviews, { storeId, orderId });
}

/**
 * Records a verified buyer's review, held for the store to approve. One per
 * product per order: a second submission returns the first.
 */
export async function recordReview(
  store: Pick<Store, "id" | "agencyId">,
  order: Order,
  product: { productId: string; productName: string },
  input: ReviewInput,
  locale: string,
): Promise<{ review: ProductReview; created: boolean }> {
  const existing = await db.findOne<ProductReview>(COLLECTIONS.reviews, {
    storeId: store.id,
    orderId: order.id,
    productId: product.productId,
  });
  if (existing) return { review: existing, created: false };
  const now = new Date().toISOString();
  const review: ProductReview = {
    id: newId("rev"),
    storeId: store.id,
    productId: product.productId,
    productName: product.productName,
    orderId: order.id,
    orderCode: order.code,
    authorName: input.authorName.trim(),
    email: order.customer.email.trim().toLowerCase(),
    rating: input.rating,
    title: input.title.trim(),
    body: input.body.trim(),
    locale,
    status: "pending",
    moderatedBy: null,
    moderatedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await db.insertOne(COLLECTIONS.reviews, review as unknown as Record<string, unknown>);
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    const winner = await db.findOne<ProductReview>(COLLECTIONS.reviews, {
      storeId: store.id,
      orderId: order.id,
      productId: product.productId,
    });
    if (winner) return { review: winner, created: false };
    throw error;
  }
  recordAudit({
    category: "publishing",
    action: "review.submitted",
    summary: `${review.authorName} reviewed “${review.productName}” (${review.rating} of 5) on ${order.code}`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: "system",
    actorName: "Shopper",
    entity: "review",
    entityId: review.id,
    meta: { rating: review.rating },
  });
  return { review, created: true };
}

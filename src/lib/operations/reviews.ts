import "server-only";
import { revalidatePath } from "next/cache";
import { COLLECTIONS, getStoreProduct, recordAudit } from "../data";
import { db } from "../mongo";
import { getReview } from "../review-data";
import type { ProductReview, ReviewStatus } from "../types";
import type { OperationContext } from "./context";

/** Moderating reviews. The workspace's review actions and the Admin API both run these. */

export function findReview(storeId: string, reviewId: string): Promise<ProductReview | null> {
  return getReview(storeId, reviewId);
}

async function revalidateReviews(ctx: OperationContext, productId: string) {
  revalidatePath(`/app/stores/${ctx.store.id}/reviews`);
  const product = await getStoreProduct(productId);
  if (product && product.storeId === ctx.store.id) revalidatePath(`/s/${ctx.store.slug}`, "layout");
}

function audit(ctx: OperationContext, action: string, summary: string, review: ProductReview) {
  recordAudit({
    category: "publishing",
    action,
    summary,
    storeId: ctx.store.id,
    agencyId: ctx.store.agencyId,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "review",
    entityId: review.id,
    meta: { rating: review.rating },
  });
}

const VERB: Record<ReviewStatus, string> = { approved: "Approved", rejected: "Rejected", pending: "Moved back to pending" };

/** Approves or rejects a review, or puts it back to pending. Setting the status it has changes nothing. */
export async function moderateReview(ctx: OperationContext, review: ProductReview, status: ReviewStatus): Promise<ProductReview> {
  if (review.status === status) return review;
  const now = new Date().toISOString();
  const patch = { status, moderatedBy: ctx.actor.name, moderatedAt: now, updatedAt: now };
  await db.updateOne(COLLECTIONS.reviews, { storeId: ctx.store.id, id: review.id }, { $set: patch });
  audit(ctx, `review.${status}`, `${VERB[status]} ${review.authorName}'s review of “${review.productName}”`, review);
  await revalidateReviews(ctx, review.productId);
  return { ...review, ...patch };
}

export async function deleteReview(ctx: OperationContext, review: ProductReview): Promise<void> {
  await db.deleteOne(COLLECTIONS.reviews, { storeId: ctx.store.id, id: review.id });
  audit(ctx, "review.deleted", `Deleted ${review.authorName}'s review of “${review.productName}”`, review);
  await revalidateReviews(ctx, review.productId);
}

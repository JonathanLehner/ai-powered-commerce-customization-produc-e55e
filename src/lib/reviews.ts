/**
 * Product reviews: who may write one, what it may say, and how ratings add up.
 *
 * Shared by the order page, the product page, the workspace, the Admin API and
 * `npm run reviews-check`. Kept free of server imports.
 */
import type { Order, ProductReview, ReviewStatus } from "./types";

export const REVIEW_STATUSES = ["pending", "approved", "rejected"] as const satisfies readonly ReviewStatus[];

export const REVIEW_LIMITS = { title: 120, body: 2000, minBody: 10, name: 60 } as const;

export function isReviewStatus(value: unknown): value is ReviewStatus {
  return value === "pending" || value === "approved" || value === "rejected";
}

/**
 * The products on an order its buyer may review: one entry per product, once
 * the order has been delivered, gift cards left out.
 */
export function reviewableItems(
  order: Pick<Order, "status" | "items">,
  giftCardProductIds: ReadonlySet<string> = new Set(),
): { productId: string; productName: string }[] {
  if (order.status !== "delivered") return [];
  const seen = new Set<string>();
  const out: { productId: string; productName: string }[] = [];
  for (const item of order.items) {
    if (!item.storeProductId || seen.has(item.storeProductId) || giftCardProductIds.has(item.storeProductId)) continue;
    seen.add(item.storeProductId);
    out.push({ productId: item.storeProductId, productName: item.productName });
  }
  return out;
}

export type ReviewProblem = "ratingInvalid" | "titleTooLong" | "bodyTooShort" | "bodyTooLong" | "nameRequired" | "nameTooLong";

export interface ReviewInput {
  rating: number;
  title: string;
  body: string;
  authorName: string;
}

/** The first thing wrong with a review, with the field it is about, or null. */
export function reviewProblem(input: ReviewInput): { problem: ReviewProblem; field: keyof ReviewInput } | null {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) return { problem: "ratingInvalid", field: "rating" };
  if (input.title.trim().length > REVIEW_LIMITS.title) return { problem: "titleTooLong", field: "title" };
  const body = input.body.trim();
  if (body.length < REVIEW_LIMITS.minBody) return { problem: "bodyTooShort", field: "body" };
  if (body.length > REVIEW_LIMITS.body) return { problem: "bodyTooLong", field: "body" };
  const name = input.authorName.trim();
  if (!name) return { problem: "nameRequired", field: "authorName" };
  if (name.length > REVIEW_LIMITS.name) return { problem: "nameTooLong", field: "authorName" };
  return null;
}

/** How a buyer's name is shown by default: first name and the initial of the last, "Anna K.". */
export function reviewerName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, REVIEW_LIMITS.name);
  return `${parts[0]} ${parts.at(-1)!.charAt(0).toUpperCase()}.`.slice(0, REVIEW_LIMITS.name);
}

export interface RatingSummary {
  /** Rounded to one decimal; 0 when there are no reviews. */
  average: number;
  count: number;
  /** Reviews per star, index 0 is one star. */
  distribution: [number, number, number, number, number];
}

/** The aggregate of the approved reviews given. */
export function ratingSummary(reviews: Pick<ProductReview, "rating" | "status">[]): RatingSummary {
  const approved = reviews.filter((review) => review.status === "approved");
  const distribution: RatingSummary["distribution"] = [0, 0, 0, 0, 0];
  for (const review of approved) distribution[Math.min(5, Math.max(1, review.rating)) - 1] += 1;
  const count = approved.length;
  const total = approved.reduce((sum, review) => sum + review.rating, 0);
  return { average: count ? Math.round((total / count) * 10) / 10 : 0, count, distribution };
}

/** The schema.org parts of a Product for its reviews, empty when it has none approved. */
export function reviewJsonLd(
  summary: RatingSummary,
  reviews: Pick<ProductReview, "rating" | "title" | "body" | "authorName" | "createdAt">[],
): Record<string, unknown> {
  if (summary.count === 0) return {};
  return {
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: summary.average,
      reviewCount: summary.count,
      bestRating: 5,
      worstRating: 1,
    },
    review: reviews.slice(0, 10).map((review) => ({
      "@type": "Review",
      author: { "@type": "Person", name: review.authorName },
      datePublished: review.createdAt.slice(0, 10),
      ...(review.title ? { name: review.title } : {}),
      reviewBody: review.body,
      reviewRating: { "@type": "Rating", ratingValue: review.rating, bestRating: 5, worstRating: 1 },
    })),
  };
}

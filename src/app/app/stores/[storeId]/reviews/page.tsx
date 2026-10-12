import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { deleteReview, moderateReview } from "@/app/actions/reviews";
import { ConfirmSubmit, SubmitButton } from "@/components/forms";
import { Stars } from "@/components/Stars";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { listReviews } from "@/lib/review-data";
import { REVIEW_STATUSES, isReviewStatus } from "@/lib/reviews";
import { requireStoreAccess, roleCan } from "@/lib/session";
import type { ReviewStatus } from "@/lib/types";
import { formatDate } from "@/lib/util";
import { cn } from "@/lib/utils";

const TONES: Record<ReviewStatus, "amber" | "green" | "slate"> = { pending: "amber", approved: "green", rejected: "slate" };

export default async function ReviewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const [{ storeId }, { status: rawStatus }] = await Promise.all([params, searchParams]);
  const status: ReviewStatus | "all" = isReviewStatus(rawStatus) ? rawStatus : rawStatus === "all" ? "all" : "pending";
  const { role } = await requireStoreAccess(storeId, "store.view");
  const canModerate = roleCan(role, "store.catalog");
  const [all, t, locale] = await Promise.all([listReviews(storeId), getTranslations("reviews"), getLocale()]);
  const shown = status === "all" ? all : all.filter((review) => review.status === status);
  const count = (key: ReviewStatus) => all.filter((review) => review.status === key).length;
  const base = `/app/stores/${storeId}/reviews`;
  const filters = [...REVIEW_STATUSES.map((key) => ({ key, label: t(`filter.${key}`, { count: count(key) }) })), { key: "all" as const, label: t("filter.all", { count: all.length }) }];

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />

      <nav aria-label={t("filterLabel")}>
        <ul className="inline-flex h-9 w-fit flex-wrap items-center rounded-lg bg-muted p-[3px] text-muted-foreground">
          {filters.map((filter) => (
            <li key={filter.key} className="h-full">
              <Link
                href={filter.key === "pending" ? base : `${base}?status=${filter.key}`}
                aria-current={filter.key === status ? "page" : undefined}
                className={cn(
                  "inline-flex h-full items-center rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors",
                  filter.key === status ? "bg-background text-foreground shadow-sm" : "text-foreground/60 hover:text-foreground",
                )}
              >
                {filter.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {shown.length === 0 ? (
        <EmptyState title={status === "pending" ? t("emptyPending") : t("empty")} description={t("emptyBody")} />
      ) : (
        <ul className="space-y-4">
          {shown.map((review) => (
            <li key={review.id}>
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Stars rating={review.rating} label={t("rating", { rating: review.rating })} />
                    <Badge tone={TONES[review.status]}>{t(`status.${review.status}`)}</Badge>
                    <Link
                      href={`/app/stores/${storeId}/catalog/${review.productId}`}
                      className="text-sm font-medium text-foreground hover:underline"
                    >
                      {review.productName}
                    </Link>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("byline", { name: review.authorName, date: formatDate(review.createdAt, locale) })} ·{" "}
                    <Link href={`/app/stores/${storeId}/orders/${review.orderId}`} className="hover:underline">
                      {t("verified", { code: review.orderCode })}
                    </Link>
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {review.title ? <p className="font-medium text-foreground">{review.title}</p> : null}
                  <p className="text-sm whitespace-pre-line text-inksoft">{review.body}</p>
                  {canModerate ? (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {review.status !== "approved" ? (
                        <form action={moderateReview}>
                          <input type="hidden" name="storeId" value={storeId} />
                          <input type="hidden" name="reviewId" value={review.id} />
                          <input type="hidden" name="status" value="approved" />
                          <SubmitButton size="sm" pendingLabel={t("working")}>
                            {t("approve")}
                          </SubmitButton>
                        </form>
                      ) : null}
                      {review.status !== "rejected" ? (
                        <form action={moderateReview}>
                          <input type="hidden" name="storeId" value={storeId} />
                          <input type="hidden" name="reviewId" value={review.id} />
                          <input type="hidden" name="status" value="rejected" />
                          <SubmitButton size="sm" variant="outline" pendingLabel={t("working")}>
                            {t("reject")}
                          </SubmitButton>
                        </form>
                      ) : null}
                      <form action={deleteReview}>
                        <input type="hidden" name="storeId" value={storeId} />
                        <input type="hidden" name="reviewId" value={review.id} />
                        <ConfirmSubmit confirmLabel={t("deleteConfirm")} variant="ghost" size="sm">
                          {t("delete")}
                        </ConfirmSubmit>
                      </form>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

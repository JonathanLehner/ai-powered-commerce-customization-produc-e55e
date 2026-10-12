"use client";

import { StarIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { submitReview } from "@/app/actions/product-reviews";
import { FormStatus, SubmitButton, useSubmission } from "@/components/forms";
import type { ActionState } from "@/app/actions/stores";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { REVIEW_LIMITS } from "@/lib/reviews";
import { cn } from "@/lib/utils";

/** A review of one product on a delivered order. Once sent, it says it is waiting to be published. */
export function ReviewForm({
  storeId,
  code,
  token,
  productId,
  productName,
  defaultName,
}: {
  storeId: string;
  code: string;
  token: string;
  productId: string;
  productName: string;
  defaultName: string;
}) {
  const t = useTranslations("storefront.reviews");
  const [{ state }, formAction] = useSubmission<ActionState>(submitReview, { status: "idle" });
  const [rating, setRating] = useState(0);
  const prefix = `review-${productId}`;

  if (state.status === "success") {
    return (
      <p role="status" className="rounded-lg border border-border bg-muted/60 px-4 py-3 text-sm text-inksoft">
        {state.message}
      </p>
    );
  }

  return (
    <form action={formAction} noValidate className="space-y-4 rounded-xl border border-border p-4">
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="productId" value={productId} />
      <p className="font-medium text-foreground">{productName}</p>
      <fieldset aria-invalid={state.field === "rating" ? true : undefined}>
        <legend className="text-sm font-medium text-foreground">{t("yourRating")}</legend>
        <div className="mt-1.5 flex gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <label key={star} className="cursor-pointer">
              <input
                type="radio"
                name="rating"
                value={star}
                checked={rating === star}
                onChange={() => setRating(star)}
                className="peer sr-only"
              />
              <span className="sr-only">{t("stars", { count: star })}</span>
              <StarIcon
                aria-hidden
                className={cn(
                  "size-7 rounded peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
                  star <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/50",
                )}
              />
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <Label htmlFor={`${prefix}-title`}>{t("reviewTitle")}</Label>
        <Input id={`${prefix}-title`} name="title" maxLength={REVIEW_LIMITS.title} className="mt-1.5" aria-invalid={state.field === "title" ? true : undefined} />
      </div>
      <div>
        <Label htmlFor={`${prefix}-body`}>{t("reviewBody")}</Label>
        <Textarea
          id={`${prefix}-body`}
          name="body"
          rows={4}
          maxLength={REVIEW_LIMITS.body}
          required
          className="mt-1.5"
          aria-invalid={state.field === "body" ? true : undefined}
        />
      </div>
      <div className="max-w-xs">
        <Label htmlFor={`${prefix}-name`}>{t("shownAs")}</Label>
        <Input
          id={`${prefix}-name`}
          name="authorName"
          defaultValue={defaultName}
          maxLength={REVIEW_LIMITS.name}
          required
          className="mt-1.5"
          aria-invalid={state.field === "authorName" ? true : undefined}
        />
      </div>
      <FormStatus state={state} />
      <SubmitButton pendingLabel={t("sending")}>{t("submit")}</SubmitButton>
    </form>
  );
}

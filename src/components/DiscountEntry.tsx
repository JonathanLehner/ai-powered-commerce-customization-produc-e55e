"use client";

import { applyDiscount, removeDiscount } from "@/app/actions/shop";
import { FormStatus, SubmitButton, useSubmission } from "@/components/forms";
import type { ActionState } from "@/app/actions/stores";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { StorefrontCopy } from "@/lib/i18n";

/**
 * Where a shopper enters a discount code. The same block sits in the basket and
 * in the checkout summary, so a code typed in either place is the one the order
 * is charged against.
 *
 * `code` is whatever is on the basket, applied or not: a code that has stopped
 * qualifying — the basket dropped below its minimum, say — stays visible with
 * `note` explaining why, so the shopper can see it rather than wonder where the
 * saving went.
 */
export function DiscountEntry({
  storeId,
  code,
  note,
  t,
}: {
  storeId: string;
  code: string | null;
  note?: string | null;
  t: StorefrontCopy["discount"];
}) {
  const [{ state }, formAction] = useSubmission<ActionState>(applyDiscount, { status: "idle" });

  if (code) {
    return (
      <div className="mt-5 border-t border-line pt-4">
        <p className="text-sm leading-none font-medium text-foreground">{t.title}</p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="font-mono text-sm text-ink">{code}</span>
          <form action={removeDiscount}>
            <input type="hidden" name="storeId" value={storeId} />
            <SubmitButton variant="ghost" size="sm" pendingLabel={t.applying}>
              {t.remove}
            </SubmitButton>
          </form>
        </div>
        {note ? <p className="mt-1 text-xs text-rose-700">{note}</p> : null}
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-5 border-t border-line pt-4" noValidate>
      <input type="hidden" name="storeId" value={storeId} />
      <Label htmlFor="discount-code">{t.title}</Label>
      <div className="mt-1 flex items-start gap-2">
        <Input
          id="discount-code"
          name="code"
          autoComplete="off"
          placeholder={t.placeholder}
          aria-invalid={state.field === "code" ? true : undefined}
          aria-label={t.label}
          className="font-mono uppercase"
        />
        <SubmitButton variant="outline" className="shrink-0" pendingLabel={t.applying}>
          {t.apply}
        </SubmitButton>
      </div>
      <FormStatus state={state} />
    </form>
  );
}

"use client";

import { useTranslations } from "next-intl";
import { applyGiftCard, removeGiftCard } from "@/app/actions/shop";
import { FormStatus, SubmitButton, useSubmission } from "@/components/forms";
import type { ActionState } from "@/app/actions/stores";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Where a shopper enters a gift card, in the basket and the checkout summary.
 * What it pays is worked out from the card's balance on every render, and the
 * amount is held on the card when the order is placed.
 */
export function GiftCardEntry({
  storeId,
  card,
  note,
}: {
  storeId: string;
  /** The card on the basket, with its balance formatted in the basket currency. */
  card: { last4: string; balance: string } | null;
  note?: string | null;
}) {
  const t = useTranslations("storefront.giftCard");
  const [{ state }, formAction] = useSubmission<ActionState>(applyGiftCard, { status: "idle" });

  if (card) {
    return (
      <div className="mt-5 border-t border-border pt-4">
        <p className="text-sm leading-none font-medium text-foreground">{t("title")}</p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-sm text-foreground">
            <span className="font-mono">•••• {card.last4}</span>
            <span className="ml-2 text-muted-foreground">{t("balance", { amount: card.balance })}</span>
          </span>
          <form action={removeGiftCard}>
            <input type="hidden" name="storeId" value={storeId} />
            <SubmitButton variant="ghost" size="sm" pendingLabel={t("applying")}>
              {t("remove")}
            </SubmitButton>
          </form>
        </div>
        {note ? <p className="mt-1 text-xs text-rose-700">{note}</p> : null}
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-5 border-t border-border pt-4" noValidate>
      <input type="hidden" name="storeId" value={storeId} />
      <Label htmlFor="gift-card-code">{t("title")}</Label>
      <div className="mt-1 flex items-start gap-2">
        <Input
          id="gift-card-code"
          name="code"
          autoComplete="off"
          placeholder={t("placeholder")}
          aria-invalid={state.field === "code" ? true : undefined}
          className="font-mono uppercase placeholder:font-sans placeholder:normal-case"
        />
        <SubmitButton variant="outline" className="shrink-0" pendingLabel={t("applying")}>
          {t("apply")}
        </SubmitButton>
      </div>
      <FormStatus state={state} />
    </form>
  );
}

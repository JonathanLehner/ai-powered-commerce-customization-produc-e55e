"use client";

import { LockIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { cancelCampaign, decideCampaign, payCampaign } from "@/app/actions/gifting";
import type { ActionState } from "@/app/actions/stores";
import { ActionForm, ConfirmSubmit, FormStatus, SubmitButton } from "@/components/forms";
import { DemoCardFields } from "@/components/DemoCardFields";
import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Approve or decline, from the link sent to the approver.
 *
 * Both buttons post the same form and carry the decision themselves, so the
 * note the approver typed travels with either one. That is why this form is
 * assembled by hand rather than through `ActionForm`, which has a single
 * submit button.
 */
export function ApprovalForm({
  slug,
  code,
  token,
  buyerName,
  total,
}: {
  slug: string;
  code: string;
  token: string;
  buyerName: string;
  total: string;
}) {
  const t = useTranslations("storefront.gift");
  const [state, formAction] = useActionState<ActionState, FormData>(decideCampaign, { status: "idle" });

  return (
    <form action={formAction} noValidate>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="token" value={token} />
      <p className="text-sm text-muted-foreground">{t("approvalIntro", { buyer: buyerName })}</p>
      <Label htmlFor="note" className="mt-4">
        {t("noteLabel")}
      </Label>
      <Textarea
        id="note"
        name="note"
        rows={3}
        placeholder={t("notePlaceholder")}
        aria-invalid={state.field === "note" ? true : undefined}
        className="mt-1.5"
      />
      <FormStatus state={state} />
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <SubmitButton
          className={buttonVariants()}
          pendingLabel={t("approvePending")}
          name="decision"
          value="approve"
        >
          {t("approve", { total })}
        </SubmitButton>
        <SubmitButton
          className={buttonVariants({ variant: "destructive" })}
          pendingLabel={t("declinePending")}
          name="decision"
          value="decline"
        >
          {t("decline")}
        </SubmitButton>
      </div>
    </form>
  );
}

export function PaymentForm({
  slug,
  code,
  token,
  total,
  demo,
}: {
  slug: string;
  code: string;
  token: string;
  total: string;
  /** A demo store simulates the card payment; a live store continues to Stripe Checkout. */
  demo: boolean;
}) {
  const t = useTranslations("storefront.gift");
  // The payment copy is the checkout's.
  const card = useTranslations("storefront.checkout");
  return (
    <ActionForm
      action={payCampaign}
      submitLabel={t("pay", { total })}
      pendingLabel={t("payPending")}
      hidden={{ slug, code, token }}
    >
      {(state) => (
        <>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <LockIcon aria-hidden className="size-3.5" />
            {t("paymentIntro")} {card("paymentNote")}
          </p>
          {demo ? <DemoCardFields field={state.field} /> : null}
        </>
      )}
    </ActionForm>
  );
}

export function CancelCampaignForm({
  slug,
  code,
  token,
}: {
  slug: string;
  code: string;
  token: string;
}) {
  const t = useTranslations("storefront.gift");
  return (
    <form action={cancelCampaign}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="token" value={token} />
      <ConfirmSubmit
        className={buttonVariants({ variant: "ghost", size: "sm" })}
        confirmLabel={t("withdrawConfirm")}
        question={t("withdrawQuestion")}
        pendingLabel={t("withdrawPending")}
        cancelLabel={t("cancel")}
      >
        {t("withdraw")}
      </ConfirmSubmit>
    </form>
  );
}

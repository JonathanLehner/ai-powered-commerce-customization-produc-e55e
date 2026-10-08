"use client";

import { useActionState } from "react";
import { cancelCampaign, decideCampaign, payCampaign } from "@/app/actions/gifting";
import type { ActionState } from "@/app/actions/stores";
import { ActionForm, ConfirmSubmit, FormStatus, SubmitButton } from "@/components/forms";
import { fmt, fmtAround, type StorefrontCopy } from "@/lib/i18n";
import { TEST_CARDS } from "@/lib/stripe";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Stripe's published test numbers, labelled in the store's language. */
const TEST_CARD_LABELS: Record<string, keyof StorefrontCopy["checkout"]> = {
  "4242 4242 4242 4242": "cardSucceeds",
  "4000 0000 0000 0002": "cardDeclined",
  "4000 0000 0000 9995": "cardInsufficient",
};

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
  t,
}: {
  slug: string;
  code: string;
  token: string;
  buyerName: string;
  total: string;
  t: StorefrontCopy["gift"];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(decideCampaign, { status: "idle" });

  return (
    <form action={formAction} noValidate>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="token" value={token} />
      <p className="text-sm text-muted-foreground">{fmt(t.approvalIntro, { buyer: buyerName })}</p>
      <Label htmlFor="note" className="mt-4">
        {t.noteLabel}
      </Label>
      <Textarea
        id="note"
        name="note"
        rows={3}
        placeholder={t.notePlaceholder}
        aria-invalid={state.field === "note" ? true : undefined}
        className="mt-1.5"
      />
      <FormStatus state={state} />
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <SubmitButton
          className={buttonVariants()}
          pendingLabel={t.approvePending}
          name="decision"
          value="approve"
        >
          {fmt(t.approve, { total })}
        </SubmitButton>
        <SubmitButton
          className={buttonVariants({ variant: "destructive" })}
          pendingLabel={t.declinePending}
          name="decision"
          value="decline"
        >
          {t.decline}
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
  stripeAccountId,
  t,
  card,
}: {
  slug: string;
  code: string;
  token: string;
  total: string;
  stripeAccountId: string | null;
  t: StorefrontCopy["gift"];
  /** The card fields are the checkout's, so they share its copy. */
  card: StorefrontCopy["checkout"];
}) {
  // The account id is rendered as a node, so the sentence is split around it
  // and each half keeps its own language's word order.
  const [payBefore, payAfter] = fmtAround(t.paymentIntro, "account");

  return (
    <ActionForm
      action={payCampaign}
      submitLabel={fmt(t.pay, { total })}
      pendingLabel={t.payPending}
      hidden={{ slug, code, token }}
    >
      {(state) => (
        <>
          <p className="text-sm text-muted-foreground">
            {payBefore}
            {stripeAccountId ? <span className="font-mono text-xs">{stripeAccountId}</span> : null}
            {payAfter}
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="cardNumber">
                {card.cardNumber}
              </Label>
              <Input
                id="cardNumber"
                name="cardNumber"
                inputMode="numeric"
                autoComplete="cc-number"
                placeholder="4242 4242 4242 4242"
                required
                aria-invalid={state.field === "cardNumber" ? true : undefined}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="expiry">
                {card.expiry}
              </Label>
              <Input
                id="expiry"
                name="expiry"
                autoComplete="cc-exp"
                placeholder="04/29"
                required
                aria-invalid={state.field === "expiry" ? true : undefined}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="cvc">
                {card.securityCode}
              </Label>
              <Input
                id="cvc"
                name="cvc"
                inputMode="numeric"
                autoComplete="cc-csc"
                placeholder="123"
                required
                aria-invalid={state.field === "cvc" ? true : undefined}
                className="mt-1.5"
              />
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-border bg-muted p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">{card.testMode}</p>
            <ul className="mt-1.5 space-y-1">
              {TEST_CARDS.map((entry) => (
                <li key={entry.number}>
                  <span className="font-mono">{entry.number}</span> —{" "}
                  {card[TEST_CARD_LABELS[entry.number]] ?? entry.label}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function CancelCampaignForm({
  slug,
  code,
  token,
  t,
}: {
  slug: string;
  code: string;
  token: string;
  t: StorefrontCopy["gift"];
}) {
  return (
    <form action={cancelCampaign}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="token" value={token} />
      <ConfirmSubmit
        className={buttonVariants({ variant: "ghost", size: "sm" })}
        confirmLabel={t.withdrawConfirm}
        question={t.withdrawQuestion}
        pendingLabel={t.withdrawPending}
        cancelLabel={t.cancel}
      >
        {t.withdraw}
      </ConfirmSubmit>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { cancelCampaign, decideCampaign, payCampaign } from "@/app/actions/gifting";
import type { ActionState } from "@/app/actions/stores";
import { ActionForm, ConfirmSubmit, FormStatus, SubmitButton } from "@/components/forms";
import { TEST_CARDS } from "@/lib/stripe";

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
  const [state, formAction] = useActionState<ActionState, FormData>(decideCampaign, { status: "idle" });

  return (
    <form action={formAction} noValidate>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="token" value={token} />
      <p className="text-sm text-muted">
        {buyerName} needs your sign-off before this campaign can be paid for. Approving charges nothing — the
        buyer pays on their own screen.
      </p>
      <label htmlFor="note" className="field-label mt-4">
        Note (required to decline)
      </label>
      <textarea
        id="note"
        name="note"
        rows={3}
        placeholder="Approved against the Q4 marketing budget."
        aria-invalid={state.field === "note" ? true : undefined}
        className={state.field === "note" ? "input input-error" : "input"}
      />
      <FormStatus state={state} />
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <SubmitButton
          className="btn-primary"
          pendingLabel="Recording your decision…"
          name="decision"
          value="approve"
        >
          {`Approve ${total}`}
        </SubmitButton>
        <SubmitButton className="btn-danger" pendingLabel="Recording…" name="decision" value="decline">
          Decline
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
}: {
  slug: string;
  code: string;
  token: string;
  total: string;
  stripeAccountId: string | null;
}) {
  return (
    <ActionForm
      action={payCampaign}
      submitLabel={`Pay ${total}`}
      pendingLabel="Taking payment…"
      hidden={{ slug, code, token }}
    >
      {(state) => (
        <>
          <p className="text-sm text-muted">
            One payment for the whole campaign, charged through the store&rsquo;s own Stripe account
            {stripeAccountId ? <span className="font-mono text-xs"> {stripeAccountId}</span> : null}. Every
            recipient is then raised as their own order with their own tracking.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="cardNumber" className="field-label">
                Card number
              </label>
              <input
                id="cardNumber"
                name="cardNumber"
                inputMode="numeric"
                autoComplete="cc-number"
                placeholder="4242 4242 4242 4242"
                required
                aria-invalid={state.field === "cardNumber" ? true : undefined}
                className={state.field === "cardNumber" ? "input input-error" : "input"}
              />
            </div>
            <div>
              <label htmlFor="expiry" className="field-label">
                Expiry (MM/YY)
              </label>
              <input
                id="expiry"
                name="expiry"
                autoComplete="cc-exp"
                placeholder="04/29"
                required
                aria-invalid={state.field === "expiry" ? true : undefined}
                className={state.field === "expiry" ? "input input-error" : "input"}
              />
            </div>
            <div>
              <label htmlFor="cvc" className="field-label">
                Security code
              </label>
              <input
                id="cvc"
                name="cvc"
                inputMode="numeric"
                autoComplete="cc-csc"
                placeholder="123"
                required
                aria-invalid={state.field === "cvc" ? true : undefined}
                className={state.field === "cvc" ? "input input-error" : "input"}
              />
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-line bg-canvas p-3 text-xs text-muted">
            <p className="font-medium text-ink">Stripe test mode</p>
            <ul className="mt-1.5 space-y-1">
              {TEST_CARDS.map((card) => (
                <li key={card.number}>
                  <span className="font-mono">{card.number}</span> — {card.label}
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
}: {
  slug: string;
  code: string;
  token: string;
}) {
  return (
    <form action={cancelCampaign}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="token" value={token} />
      <ConfirmSubmit
        className="btn-ghost btn-sm"
        confirmLabel="Withdraw campaign"
        question="The list is withdrawn and nobody is charged."
      >
        Withdraw this campaign
      </ConfirmSubmit>
    </form>
  );
}

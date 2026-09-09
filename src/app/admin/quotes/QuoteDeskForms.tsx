"use client";

import { answerQuoteRequest, declineQuoteRequest } from "@/app/actions/sourcing";
import { ActionForm, Field } from "@/components/forms";
import type { QuoteRequest } from "@/lib/types";
import { toMajorString } from "@/lib/util";

/** The supplier's price, written back against the request the store raised. */
export function AnswerQuoteForm({ request }: { request: QuoteRequest }) {
  return (
    <ActionForm
      action={answerQuoteRequest}
      hidden={{ requestId: request.id }}
      submitLabel={request.status === "quoted" ? "Update the quote" : "Record the quote"}
      pendingLabel="Saving…"
      submitClassName="btn-primary btn-sm"
      footer={
        <span className="text-xs text-muted">
          The store can copy the listing in at this cost until the quote expires.
        </span>
      }
    >
      {(state) => (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={`Unit cost (${request.currency})`} htmlFor={`unitCost-${request.id}`} error={state.field === "unitCost"}>
            <input
              id={`unitCost-${request.id}`}
              name="unitCost"
              inputMode="decimal"
              defaultValue={request.response && request.status === "quoted"
                  ? toMajorString(request.response.unitCost, request.currency)
                  : ""}
              className={state.field === "unitCost" ? "input input-error py-1.5" : "input py-1.5"}
            />
          </Field>
          <Field label="Production days" htmlFor={`leadTimeDays-${request.id}`} error={state.field === "leadTimeDays"}>
            <input
              id={`leadTimeDays-${request.id}`}
              name="leadTimeDays"
              inputMode="numeric"
              defaultValue={request.status === "quoted" ? String(request.response?.leadTimeDays ?? "") : ""}
              className={state.field === "leadTimeDays" ? "input input-error py-1.5" : "input py-1.5"}
            />
          </Field>
          <Field
            label="Valid until"
            htmlFor={`validUntil-${request.id}`}
            error={state.field === "validUntil"}
            hint="Optional."
          >
            <input
              id={`validUntil-${request.id}`}
              name="validUntil"
              type="date"
              defaultValue={request.status === "quoted" ? request.response?.validUntil ?? "" : ""}
              className={state.field === "validUntil" ? "input input-error py-1.5" : "input py-1.5"}
            />
          </Field>
          <Field
            label="What the supplier said"
            htmlFor={`notes-${request.id}`}
            className="sm:col-span-3"
            hint="Trade Assurance terms, sampling cost, freight basis — the store reads this."
          >
            <textarea
              id={`notes-${request.id}`}
              name="notes"
              rows={2}
              defaultValue={request.status === "quoted" ? request.response?.notes ?? "" : ""}
              className="input py-1.5 text-sm"
            />
          </Field>
        </div>
      )}
    </ActionForm>
  );
}

/** No supplier took the run on. The reason goes back to the store. */
export function DeclineQuoteForm({ request }: { request: QuoteRequest }) {
  return (
    <ActionForm
      action={declineQuoteRequest}
      hidden={{ requestId: request.id }}
      submitLabel="Mark declined"
      pendingLabel="Saving…"
      submitClassName="btn-secondary btn-sm"
    >
      {(state) => (
        <Field
          label="Why it was declined"
          htmlFor={`reason-${request.id}`}
          error={state.field === "reason"}
          hint="Run too small, specification unclear, no factory covering the destination."
        >
          <textarea
            id={`reason-${request.id}`}
            name="reason"
            rows={2}
            className={state.field === "reason" ? "input input-error py-1.5 text-sm" : "input py-1.5 text-sm"}
          />
        </Field>
      )}
    </ActionForm>
  );
}

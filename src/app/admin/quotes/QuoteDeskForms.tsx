"use client";

import { declineQuoteRequest, recordSupplierQuote } from "@/app/actions/sourcing";
import { ActionForm, Field, SubmissionKey } from "@/components/forms";
import type { QuoteRequest } from "@/lib/types";

/** One supplier's quote, added to the enquiry the store raised. */
export function AddQuoteForm({
  request,
  catalogOptions,
}: {
  request: QuoteRequest;
  /** Offered only when the store described the product instead of naming a listing. */
  catalogOptions: { id: string; label: string }[];
}) {
  const id = (name: string) => `${name}-${request.id}`;
  const input = (field: string, error: string | undefined) =>
    error === field ? "input input-error py-1.5" : "input py-1.5";
  return (
    <ActionForm
      action={recordSupplierQuote}
      hidden={{ requestId: request.id }}
      submitLabel={(request.quotes ?? []).length > 0 ? "Add another quote" : "Record the quote"}
      pendingLabel="Saving…"
      submitClassName="btn-primary btn-sm"
      footer={
        <span className="text-xs text-muted">The store sees it beside the print-on-demand options and can accept it.</span>
      }
    >
      {(state) => (
        <div className="grid gap-3 sm:grid-cols-3">
          <SubmissionKey status={state.status} prefix="qte" />
          <Field
            label="Supplier"
            htmlFor={id("supplierLabel")}
            error={state.field === "supplierLabel"}
            className="sm:col-span-2"
            hint="The factory or seller as named on the marketplace."
          >
            <input id={id("supplierLabel")} name="supplierLabel" className={input("supplierLabel", state.field)} />
          </Field>
          <Field label={`Unit cost (${request.currency})`} htmlFor={id("unitCost")} error={state.field === "unitCost"}>
            <input id={id("unitCost")} name="unitCost" inputMode="decimal" className={input("unitCost", state.field)} />
          </Field>
          <Field
            label="Minimum order"
            htmlFor={id("minimumOrderQuantity")}
            error={state.field === "minimumOrderQuantity"}
            hint={`Blank = the ${request.quantity.toLocaleString("en-US")} asked for.`}
          >
            <input
              id={id("minimumOrderQuantity")}
              name="minimumOrderQuantity"
              inputMode="numeric"
              className={input("minimumOrderQuantity", state.field)}
            />
          </Field>
          <Field label="Production days" htmlFor={id("leadTimeDays")} error={state.field === "leadTimeDays"}>
            <input
              id={id("leadTimeDays")}
              name="leadTimeDays"
              inputMode="numeric"
              className={input("leadTimeDays", state.field)}
            />
          </Field>
          <Field label="Valid until" htmlFor={id("validUntil")} error={state.field === "validUntil"} hint="Optional.">
            <input id={id("validUntil")} name="validUntil" type="date" className={input("validUntil", state.field)} />
          </Field>
          {request.catalogProductId ? null : (
            <Field
              label="Built on catalog listing"
              htmlFor={id("baseCatalogProductId")}
              error={state.field === "baseCatalogProductId"}
              className="sm:col-span-3"
              hint="The store copy takes its variants, print areas and mockups from this listing."
            >
              <select
                id={id("baseCatalogProductId")}
                name="baseCatalogProductId"
                defaultValue=""
                className={input("baseCatalogProductId", state.field)}
              >
                <option value="">Choose the closest listing</option>
                {catalogOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field
            label="What the supplier said"
            htmlFor={id("notes")}
            className="sm:col-span-3"
            hint="Trade Assurance terms, sampling cost, freight basis — the store reads this."
          >
            <textarea id={id("notes")} name="notes" rows={2} className="input py-1.5 text-sm" />
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

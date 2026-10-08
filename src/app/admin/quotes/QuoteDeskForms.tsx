"use client";

import { declineQuoteRequest, recordSupplierQuote } from "@/app/actions/sourcing";
import { ActionForm, Field, SubmissionKey } from "@/components/forms";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
  const invalid = (field: string, error: string | undefined) => (error === field ? true : undefined);
  return (
    <ActionForm
      action={recordSupplierQuote}
      hidden={{ requestId: request.id }}
      submitLabel={(request.quotes ?? []).length > 0 ? "Add another quote" : "Record the quote"}
      pendingLabel="Saving…"
      submitSize="sm"
      footer={
        <span className="text-xs text-muted-foreground">The store sees it beside the print-on-demand options and can accept it.</span>
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
            <Input
              id={id("supplierLabel")}
              name="supplierLabel"
              className="mt-1.5"
              aria-invalid={invalid("supplierLabel", state.field)}
            />
          </Field>
          <Field
            label={`Unit cost (${request.currency})`}
            htmlFor={id("unitCost")}
            error={state.field === "unitCost"}
          >
            <Input
              id={id("unitCost")}
              name="unitCost"
              inputMode="decimal"
              className="mt-1.5"
              aria-invalid={invalid("unitCost", state.field)}
            />
          </Field>
          <Field
            label="Minimum order"
            htmlFor={id("minimumOrderQuantity")}
            error={state.field === "minimumOrderQuantity"}
            hint={`Blank = the ${request.quantity.toLocaleString("en-US")} asked for.`}
          >
            <Input
              id={id("minimumOrderQuantity")}
              name="minimumOrderQuantity"
              inputMode="numeric"
              className="mt-1.5"
              aria-invalid={invalid("minimumOrderQuantity", state.field)}
            />
          </Field>
          <Field
            label="Production days"
            htmlFor={id("leadTimeDays")}
            error={state.field === "leadTimeDays"}
          >
            <Input
              id={id("leadTimeDays")}
              name="leadTimeDays"
              inputMode="numeric"
              className="mt-1.5"
              aria-invalid={invalid("leadTimeDays", state.field)}
            />
          </Field>
          <Field
            label="Valid until"
            htmlFor={id("validUntil")}
            error={state.field === "validUntil"}
            hint="Optional."
          >
            <Input
              id={id("validUntil")}
              name="validUntil"
              type="date"
              className="mt-1.5"
              aria-invalid={invalid("validUntil", state.field)}
            />
          </Field>
          {request.catalogProductId ? null : (
            <Field
              label="Built on catalog listing"
              htmlFor={id("baseCatalogProductId")}
              error={state.field === "baseCatalogProductId"}
              className="sm:col-span-3"
              hint="The store copy takes its variants, print areas and mockups from this listing."
            >
              <Select name="baseCatalogProductId">
                <SelectTrigger
                  id={id("baseCatalogProductId")}
                  className="mt-1.5 w-full"
                  aria-invalid={invalid("baseCatalogProductId", state.field)}
                >
                  <SelectValue placeholder="Choose the closest listing" />
                </SelectTrigger>
                <SelectContent>
                  {catalogOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field
            label="What the supplier said"
            htmlFor={id("notes")}
            className="sm:col-span-3"
            hint="Trade Assurance terms, sampling cost, freight basis — the store reads this."
          >
            <Textarea id={id("notes")} name="notes" rows={2} className="mt-1.5" />
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
      submitVariant="outline"
      submitSize="sm"
    >
      {(state) => (
        <Field
          label="Why it was declined"
          htmlFor={`reason-${request.id}`}
          error={state.field === "reason"}
          hint="Run too small, specification unclear, no factory covering the destination."
        >
          <Textarea
            id={`reason-${request.id}`}
            name="reason"
            rows={2}
            className="mt-1.5"
            aria-invalid={state.field === "reason" ? true : undefined}
          />
        </Field>
      )}
    </ActionForm>
  );
}

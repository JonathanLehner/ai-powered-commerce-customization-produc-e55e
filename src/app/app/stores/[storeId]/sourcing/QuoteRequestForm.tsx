"use client";

import { requestQuote } from "@/app/actions/sourcing";
import { ActionForm, Field, SubmissionKey } from "@/components/forms";

/**
 * A bulk sourcing enquiry. Opened from a quote-priced listing it is about that
 * listing; opened on its own the buyer either refers to any catalog item or
 * describes the product in their own words.
 */
export function QuoteRequestForm({
  storeId,
  listing,
  catalogOptions,
  defaultReference = "",
  regions,
  minimumOrderQuantity,
  currency,
  defaultDestination,
  contactName,
  contactEmail,
}: {
  storeId: string;
  /** Set when the form is about one listing; the reference picker is hidden. */
  listing?: { id: string };
  catalogOptions?: { id: string; label: string }[];
  defaultReference?: string;
  regions: string[];
  minimumOrderQuantity: number;
  currency: string;
  defaultDestination: string;
  contactName: string;
  contactEmail: string;
}) {
  const input = (field: string, error: string | undefined) => (error === field ? "input input-error" : "input");
  return (
    <ActionForm
      action={requestQuote}
      hidden={listing ? { storeId, catalogId: listing.id } : { storeId }}
      submitLabel="Send enquiry"
      pendingLabel="Sending…"
      footer={
        <span className="text-xs text-muted">
          Nothing is ordered or paid today. The quotes that come back appear beside the print-on-demand options.
        </span>
      }
    >
      {(state) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <SubmissionKey status={state.status} prefix="rfqfrm" />
          {listing ? null : (
            <>
              <Field
                label="Refer to a catalog item"
                htmlFor="catalogId"
                className="sm:col-span-2"
                hint="Optional. Pick one to have it made in bulk, or leave this and describe the product below."
              >
                <select id="catalogId" name="catalogId" defaultValue={defaultReference} className="input">
                  <option value="">None — I will describe it</option>
                  {catalogOptions?.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Product"
                htmlFor="productName"
                error={state.field === "productName"}
                hint="Needed when no catalog item is picked, e.g. “Recycled canvas tote”."
              >
                <input id="productName" name="productName" className={input("productName", state.field)} />
              </Field>
            </>
          )}
          <Field
            label="Product description"
            htmlFor="description"
            className={listing ? "sm:col-span-2" : undefined}
            error={state.field === "description"}
            hint={listing ? "Optional. Anything that differs from the listing." : "Material, weight, sizes or capacity."}
          >
            <textarea id="description" name="description" rows={3} className={input("description", state.field)} />
          </Field>
          <Field
            label="Quantity"
            htmlFor="quantity"
            error={state.field === "quantity"}
            hint={
              minimumOrderQuantity > 0
                ? `Quoted from ${minimumOrderQuantity.toLocaleString("en-US")} units.`
                : "Units in the run."
            }
          >
            <input
              id="quantity"
              name="quantity"
              inputMode="numeric"
              defaultValue={minimumOrderQuantity > 0 ? String(minimumOrderQuantity) : ""}
              className={input("quantity", state.field)}
            />
          </Field>
          <Field label="Destination market" htmlFor="destination" error={state.field === "destination"}>
            <select
              id="destination"
              name="destination"
              defaultValue={defaultDestination}
              className={input("destination", state.field)}
            >
              {regions.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={`Target unit cost (${currency})`}
            htmlFor="targetUnitCost"
            error={state.field === "targetUnitCost"}
            hint="Optional. Suppliers quote closer to a number they can work against."
          >
            <input
              id="targetUnitCost"
              name="targetUnitCost"
              inputMode="decimal"
              placeholder="e.g. 3.80"
              className={input("targetUnitCost", state.field)}
            />
          </Field>
          <Field
            label="Needed by"
            htmlFor="neededBy"
            error={state.field === "neededBy"}
            hint="Optional. Sea freight adds four to six weeks on top of production."
          >
            <input id="neededBy" name="neededBy" type="date" className={input("neededBy", state.field)} />
          </Field>
          <Field
            label="Decoration needed"
            htmlFor="customisation"
            className="sm:col-span-2"
            error={state.field === "customisation"}
            hint="Print or embroidery, placement and colours, labels and packaging — or “none, blank stock”."
          >
            <textarea
              id="customisation"
              name="customisation"
              rows={3}
              className={input("customisation", state.field)}
            />
          </Field>
          <Field label="Reply to" htmlFor="contactName" error={state.field === "contactName"}>
            <input
              id="contactName"
              name="contactName"
              autoComplete="name"
              defaultValue={contactName}
              className={input("contactName", state.field)}
            />
          </Field>
          <Field label="Reply email" htmlFor="contactEmail" error={state.field === "contactEmail"}>
            <input
              id="contactEmail"
              name="contactEmail"
              type="email"
              autoComplete="email"
              defaultValue={contactEmail}
              className={input("contactEmail", state.field)}
            />
          </Field>
        </div>
      )}
    </ActionForm>
  );
}

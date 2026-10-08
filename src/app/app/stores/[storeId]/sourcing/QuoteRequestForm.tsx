"use client";

import { useState } from "react";
import { requestQuote } from "@/app/actions/sourcing";
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

/**
 * What the reference picker carries for "no catalog item". Radix refuses an
 * empty option value, so the choice is posted through a hidden field that turns
 * the sentinel back into the blank the action already expects.
 */
const NO_REFERENCE = "none";

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
  const [reference, setReference] = useState(defaultReference || NO_REFERENCE);

  return (
    <ActionForm
      action={requestQuote}
      hidden={listing ? { storeId, catalogId: listing.id } : { storeId }}
      submitLabel="Send enquiry"
      pendingLabel="Sending…"
      footer={
        <span className="text-xs text-muted-foreground">
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
                <input
                  type="hidden"
                  name="catalogId"
                  value={reference === NO_REFERENCE ? "" : reference}
                />
                <Select value={reference} onValueChange={setReference}>
                  <SelectTrigger id="catalogId" className="mt-1.5 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_REFERENCE}>None — I will describe it</SelectItem>
                    {catalogOptions?.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label="Product"
                htmlFor="productName"
                error={state.field === "productName"}
                hint="Needed when no catalog item is picked, e.g. “Recycled canvas tote”."
              >
                <Input
                  id="productName"
                  name="productName"
                  className="mt-1.5"
                  aria-invalid={state.field === "productName" ? true : undefined}
                />
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
            <Textarea
              id="description"
              name="description"
              rows={3}
              className="mt-1.5"
              aria-invalid={state.field === "description" ? true : undefined}
            />
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
            <Input
              id="quantity"
              name="quantity"
              inputMode="numeric"
              defaultValue={minimumOrderQuantity > 0 ? String(minimumOrderQuantity) : ""}
              className="mt-1.5 tabular-nums"
              aria-invalid={state.field === "quantity" ? true : undefined}
            />
          </Field>
          <Field label="Destination market" htmlFor="destination" error={state.field === "destination"}>
            <Select name="destination" defaultValue={defaultDestination}>
              <SelectTrigger
                id="destination"
                className="mt-1.5 w-full"
                aria-invalid={state.field === "destination" ? true : undefined}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {regions.map((region) => (
                  <SelectItem key={region} value={region}>
                    {region}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label={`Target unit cost (${currency})`}
            htmlFor="targetUnitCost"
            error={state.field === "targetUnitCost"}
            hint="Optional. Suppliers quote closer to a number they can work against."
          >
            <Input
              id="targetUnitCost"
              name="targetUnitCost"
              inputMode="decimal"
              placeholder="e.g. 3.80"
              className="mt-1.5 tabular-nums"
              aria-invalid={state.field === "targetUnitCost" ? true : undefined}
            />
          </Field>
          <Field
            label="Needed by"
            htmlFor="neededBy"
            error={state.field === "neededBy"}
            hint="Optional. Sea freight adds four to six weeks on top of production."
          >
            <Input
              id="neededBy"
              name="neededBy"
              type="date"
              className="mt-1.5"
              aria-invalid={state.field === "neededBy" ? true : undefined}
            />
          </Field>
          <Field
            label="Decoration needed"
            htmlFor="customisation"
            className="sm:col-span-2"
            error={state.field === "customisation"}
            hint="Print or embroidery, placement and colours, labels and packaging — or “none, blank stock”."
          >
            <Textarea
              id="customisation"
              name="customisation"
              rows={3}
              className="mt-1.5"
              aria-invalid={state.field === "customisation" ? true : undefined}
            />
          </Field>
          <Field label="Reply to" htmlFor="contactName" error={state.field === "contactName"}>
            <Input
              id="contactName"
              name="contactName"
              autoComplete="name"
              defaultValue={contactName}
              className="mt-1.5"
              aria-invalid={state.field === "contactName" ? true : undefined}
            />
          </Field>
          <Field label="Reply email" htmlFor="contactEmail" error={state.field === "contactEmail"}>
            <Input
              id="contactEmail"
              name="contactEmail"
              type="email"
              autoComplete="email"
              defaultValue={contactEmail}
              className="mt-1.5"
              aria-invalid={state.field === "contactEmail" ? true : undefined}
            />
          </Field>
        </div>
      )}
    </ActionForm>
  );
}

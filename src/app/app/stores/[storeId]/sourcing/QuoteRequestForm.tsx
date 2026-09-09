"use client";

import { useEffect, useRef, useState } from "react";
import { requestQuote } from "@/app/actions/sourcing";
import type { ActionState } from "@/app/actions/stores";
import { ActionForm, Field } from "@/components/forms";
import { newId } from "@/lib/util";

/**
 * One key per filled-in form. A double click, a slow reply or a retried
 * submission carries the same key, so the supplier is asked once; an accepted
 * request rotates it, so the next run this buyer asks about is a new request.
 */
function SubmissionKey({ status }: { status: ActionState["status"] }) {
  const [key, setKey] = useState("");
  const previous = useRef<ActionState["status"]>("idle");

  useEffect(() => {
    if (!key || (status === "success" && previous.current !== "success")) setKey(newId("rfqfrm"));
    previous.current = status;
  }, [status, key]);

  return <input type="hidden" name="submissionKey" value={key} />;
}

export function QuoteRequestForm({
  storeId,
  catalogId,
  regions,
  minimumOrderQuantity,
  currency,
  defaultDestination,
  contactName,
  contactEmail,
}: {
  storeId: string;
  catalogId: string;
  regions: string[];
  minimumOrderQuantity: number;
  currency: string;
  defaultDestination: string;
  contactName: string;
  contactEmail: string;
}) {
  return (
    <ActionForm
      action={requestQuote}
      hidden={{ storeId, catalogId }}
      submitLabel="Send request"
      pendingLabel="Sending…"
      footer={
        <span className="text-xs text-muted">
          Nothing is ordered or paid today. A quote that comes back is what prices the listing.
        </span>
      }
    >
      {(state) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <SubmissionKey status={state.status} />
          <Field
            label="How many units"
            htmlFor="quantity"
            error={state.field === "quantity"}
            hint={`Quoted from ${minimumOrderQuantity.toLocaleString("en-US")} units.`}
          >
            <input
              id="quantity"
              name="quantity"
              inputMode="numeric"
              defaultValue={String(minimumOrderQuantity)}
              className={state.field === "quantity" ? "input input-error" : "input"}
            />
          </Field>
          <Field label="Delivered to" htmlFor="destination" error={state.field === "destination"}>
            <select
              id="destination"
              name="destination"
              defaultValue={defaultDestination}
              className={state.field === "destination" ? "input input-error" : "input"}
            >
              {regions.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={`Target unit price (${currency})`}
            htmlFor="targetUnitCost"
            error={state.field === "targetUnitCost"}
            hint="Optional. Suppliers quote closer to a number they can work against."
          >
            <input
              id="targetUnitCost"
              name="targetUnitCost"
              inputMode="decimal"
              placeholder="e.g. 3.80"
              className={state.field === "targetUnitCost" ? "input input-error" : "input"}
            />
          </Field>
          <Field
            label="Needed by"
            htmlFor="neededBy"
            error={state.field === "neededBy"}
            hint="Optional. Sea freight adds four to six weeks on top of production."
          >
            <input
              id="neededBy"
              name="neededBy"
              type="date"
              className={state.field === "neededBy" ? "input input-error" : "input"}
            />
          </Field>
          <Field
            label="Specification for the factory"
            htmlFor="customisation"
            className="sm:col-span-2"
            error={state.field === "customisation"}
            hint="Decoration and placement, materials and weight, colours, sizes, labelling and packaging."
          >
            <textarea
              id="customisation"
              name="customisation"
              rows={5}
              className={state.field === "customisation" ? "input input-error" : "input"}
            />
          </Field>
          <Field label="Reply to" htmlFor="contactName" error={state.field === "contactName"}>
            <input
              id="contactName"
              name="contactName"
              autoComplete="name"
              defaultValue={contactName}
              className={state.field === "contactName" ? "input input-error" : "input"}
            />
          </Field>
          <Field label="Reply email" htmlFor="contactEmail" error={state.field === "contactEmail"}>
            <input
              id="contactEmail"
              name="contactEmail"
              type="email"
              autoComplete="email"
              defaultValue={contactEmail}
              className={state.field === "contactEmail" ? "input input-error" : "input"}
            />
          </Field>
        </div>
      )}
    </ActionForm>
  );
}

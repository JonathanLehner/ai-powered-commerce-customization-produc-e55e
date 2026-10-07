"use client";

import { useFormStatus } from "react-dom";
import {
  addTracking,
  raiseException,
  recordManualSubmission,
  recordRefund,
  rerouteToSupplier,
} from "@/app/actions/orders";
import { ActionForm } from "@/components/forms";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Order, RoutingOptions, Store, SupplierChoice } from "@/lib/types";
import { CARRIER_LABELS, toMajorString } from "@/lib/util";

const SUPPLIER_KINDS: Record<SupplierChoice["kind"], string> = {
  print_on_demand: "Print on demand",
  manufacturer: "Manufacturer",
  sourcing_marketplace: "Sourcing marketplace",
};

function choiceLabel(choice: SupplierChoice): string {
  const lead = `${choice.leadTimeDays[0]}–${choice.leadTimeDays[1]} day lead time`;
  return `${choice.name} — ${SUPPLIER_KINDS[choice.kind]}, ${lead}`;
}

/**
 * Picks the production partner for a job automatic routing could not place.
 * Only suppliers that are approved, produce everything on the order for the
 * destination region, and are not the partner the job has already failed on
 * are offered — the same product-level test that raised the exception, so the
 * picker can never suggest the supplier the page has just said cannot do it.
 * When that leaves nobody, the panel drops the dropdown and the submit button
 * and names the routes forward that do exist instead.
 */
export function SupplierPickerForm({ order, options }: { order: Order; options: RoutingOptions }) {
  const needs = options.requirements.map((r) => r.label).join(", ");

  // "Failed on" only reads true for a job routing could not place; the same
  // panel doubles as "move production elsewhere" for one already accepted.
  const held = order.fulfillment.routing !== "submitted";

  if (options.available.length === 0) {
    const current = order.fulfillment.supplierName;
    return (
      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
        <p className="font-semibold">
          No approved partner produces this product family{needs ? ` (${needs})` : ""} for{" "}
          {options.destination}.
        </p>
        <p className="mt-1">
          Every approved supplier was checked against the product records this order was sourced from, and
          none of them fulfils {needs || "these items"} to {options.region}
          {current
            ? `, including ${current}, which ${held ? "the job has already failed on" : "it is with now"}`
            : ""}
          .
          {options.manualOnly.length > 0 ? (
            <>
              {" "}
              {options.manualOnly.map((s) => s.name).join(", ")} cover
              {options.manualOnly.length === 1 ? "s" : ""} this order but{" "}
              {options.manualOnly.length === 1 ? "has" : "have"} no order submission API, so{" "}
              {options.manualOnly.length === 1 ? "it takes" : "they take"} a purchase order raised by hand.
            </>
          ) : null}
        </p>
        <p className="mt-2 font-semibold">The routes forward are:</p>
        <ul className="mt-1 list-disc space-y-1 pl-4">
          {held ? (
            <li>
              Raise the purchase order with a partner yourself and record its reference under
              “Purchase order raised by hand” below.
            </li>
          ) : null}
          <li>Cancel the order and refund the shopper from “Refund or cancel” further down this page.</li>
          <li>
            Ask a platform administrator to widen an approved supplier’s coverage so it produces{" "}
            {needs || "these items"} for {options.region}, then re-run routing.
          </li>
        </ul>
      </div>
    );
  }

  return (
    <ActionForm
      action={rerouteToSupplier}
      className="mt-4"
      submitLabel="Send job to supplier"
      pendingLabel="Sending…"
      submitClassName="btn-primary btn-sm"
      submitDisabled={!options.carriersEnabled}
      toastOnSuccess
      hidden={{ storeId: order.storeId, orderId: order.id }}
    >
      {(state) => (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="supplierId">Alternative production partner</Label>
            <Select name="supplierId" defaultValue={options.available[0].id}>
              <SelectTrigger
                id="supplierId"
                aria-invalid={state.field === "supplierId" ? true : undefined}
                aria-describedby="supplierId-hint"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.available.map((choice) => (
                  <SelectItem key={choice.id} value={choice.id}>
                    {choiceLabel(choice)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p id="supplierId-hint" className="field-hint">
              Approved partners whose own product records fulfil {needs || "these items"} to{" "}
              {options.region}. {held ? "The supplier this job failed on" : "The supplier it is with now"} is
              not offered.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reroute-reason">Why is it moving?</Label>
            <Input
              id="reroute-reason"
              name="reason"
              required
              placeholder="Original supplier does not fulfil to this destination"
              aria-invalid={state.field === "reason" ? true : undefined}
              aria-describedby="reroute-reason-hint"
            />
            <p id="reroute-reason-hint" className="field-hint">
              Recorded against your name in the fulfilment timeline and the audit history.
            </p>
          </div>
          {!options.carriersEnabled ? (
            <p className="text-xs text-rose-600">
              No carrier is enabled for this store, so no supplier can dispatch the parcel. Turn one on in
              store settings first.
            </p>
          ) : null}
        </div>
      )}
    </ActionForm>
  );
}

export function ManualSubmissionForm({ order }: { order: Order }) {
  return (
    <ActionForm
      action={recordManualSubmission}
      submitLabel="Record supplier reference"
      submitClassName="btn-primary btn-sm"
      toastOnSuccess
      hidden={{ storeId: order.storeId, orderId: order.id }}
    >
      {(state) => (
        <div className="space-y-1.5">
          <Label htmlFor="reference">Supplier purchase order reference</Label>
          <Input
            id="reference"
            name="reference"
            required
            placeholder="e.g. ALB-2049117"
            aria-invalid={state.field === "reference" ? true : undefined}
            aria-describedby="reference-hint"
          />
          <p id="reference-hint" className="field-hint">
            Use this once the purchase order has been raised with the supplier by hand.
          </p>
        </div>
      )}
    </ActionForm>
  );
}

export function TrackingForm({ order, store }: { order: Order; store: Store }) {
  const enabled = store.carriers.filter((c) => c.enabled);
  return (
    <ActionForm
      action={addTracking}
      submitLabel={order.fulfillment.trackingNumber ? "Update tracking" : "Mark shipped"}
      submitClassName="btn-primary btn-sm"
      className="mt-3"
      toastOnSuccess
      hidden={{ storeId: order.storeId, orderId: order.id }}
    >
      {(state) => (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="carrier">Carrier</Label>
            {/* No carrier enabled is a real state: the field says so and the
                action refuses, rather than offering a carrier that is off. */}
            <Select
              name="carrier"
              defaultValue={order.fulfillment.carrier ?? enabled[0]?.carrier ?? "none"}
            >
              <SelectTrigger
                id="carrier"
                aria-invalid={state.field === "carrier" ? true : undefined}
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {enabled.length === 0 ? (
                  <SelectItem value="none" disabled>
                    No carriers enabled
                  </SelectItem>
                ) : null}
                {enabled.map((c) => (
                  <SelectItem key={c.carrier} value={c.carrier}>
                    {CARRIER_LABELS[c.carrier]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="trackingNumber">Tracking number</Label>
            <Input
              id="trackingNumber"
              name="trackingNumber"
              defaultValue={order.fulfillment.trackingNumber ?? ""}
              placeholder="Leave blank to generate one"
              aria-invalid={state.field === "trackingNumber" ? true : undefined}
            />
          </div>
        </div>
      )}
    </ActionForm>
  );
}

export function ExceptionForm({ order }: { order: Order }) {
  return (
    <ActionForm
      action={raiseException}
      submitLabel="Raise exception"
      submitClassName="btn-danger btn-sm"
      className="mt-3"
      toastOnSuccess
      hidden={{ storeId: order.storeId, orderId: order.id }}
    >
      {(state) => (
        <div className="space-y-1.5">
          <Label htmlFor="note">What has gone wrong?</Label>
          <Textarea
            id="note"
            name="note"
            rows={2}
            required
            placeholder="Supplier cannot print the artwork at this size; awaiting a replacement file."
            aria-invalid={state.field === "note" ? true : undefined}
          />
        </div>
      )}
    </ActionForm>
  );
}

/**
 * Money leaving the store's Stripe account is asked about once before it goes.
 * The confirmation posts the form it belongs to by id, because the dialog is
 * portalled to the end of the document and so sits outside that form.
 */
function RefundConfirm({ formId, question }: { formId: string; question: string }) {
  const { pending } = useFormStatus();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Record refund"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Record refund</AlertDialogTitle>
          <AlertDialogDescription>{question}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              // Posted from the handler rather than as the button's own default
              // action: closing the dialog unmounts it first, and a submitter
              // that has left the document submits nothing.
              const form = document.getElementById(formId);
              if (form instanceof HTMLFormElement) form.requestSubmit();
            }}
          >
            Yes, record it
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function RefundForm({ order }: { order: Order }) {
  const refunded = order.refunds.reduce((sum, r) => sum + r.amount, 0);
  const remaining = order.total - refunded;
  return (
    <ActionForm
      action={recordRefund}
      submitLabel="Record refund"
      submitClassName="btn-danger btn-sm"
      toastOnSuccess
      id="refund-form"
      submit={
        <RefundConfirm
          formId="refund-form"
          question="The money goes back on the store's own Stripe account and the refund is recorded against your name. This cannot be undone."
        />
      }
      hidden={{ storeId: order.storeId, orderId: order.id }}
    >
      {(state) => (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount ({order.currency})</Label>
              <Input
                id="amount"
                name="amount"
                inputMode="decimal"
                defaultValue={toMajorString(Math.max(0, remaining), order.currency)}
                required
                aria-invalid={state.field === "amount" ? true : undefined}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reason">Reason</Label>
              <Input
                id="reason"
                name="reason"
                required
                placeholder="Shopper cancelled before production"
                aria-invalid={state.field === "reason" ? true : undefined}
              />
            </div>
          </div>
          <Label className="w-fit cursor-pointer gap-2.5 font-normal text-inksoft">
            <input type="checkbox" name="cancel" className="h-4 w-4 accent-brand-600" />
            Also cancel the order
          </Label>
        </div>
      )}
    </ActionForm>
  );
}

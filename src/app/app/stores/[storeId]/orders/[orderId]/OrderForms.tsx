"use client";

import {
  addTracking,
  raiseException,
  recordManualSubmission,
  recordRefund,
  rerouteToSupplier,
} from "@/app/actions/orders";
import type { ActionState } from "@/app/actions/stores";
import { ActionForm, FormStatus, SuccessToast, useSubmission, useValueRestore } from "@/components/forms";
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
  return `${choice.name} · ${SUPPLIER_KINDS[choice.kind]}, ${lead}`;
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
          No approved supplier delivers {needs || "these items"} to {options.destination}.
        </p>
                {options.manualOnly.length > 0 ? (
          <p className="mt-1">
            Manual purchase order only: {options.manualOnly.map((s) => s.name).join(", ")}
          </p>
        ) : null}
        {current ? <p className="mt-1">Current supplier: {current}</p> : null}
        <p className="mt-2 font-semibold">Options:</p>
        <ul className="mt-1 list-disc space-y-1 pl-4">
          {held ? (
            <li>
                            Raise a purchase order manually and record the reference below.
            </li>
          ) : null}
          <li>Cancel and refund the order below.</li>
          <li>
                        Ask a platform administrator to add a supplier for {options.region}, then re-run routing.
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
      submitSize="sm"
      submitDisabled={!options.carriersEnabled}
      hidden={{ storeId: order.storeId, orderId: order.id }}
    >
      {(state) => (
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label htmlFor="supplierId">Alternative production partner</Label>
            <Select name="supplierId" defaultValue={options.available[0].id}>
              <SelectTrigger
                id="supplierId"
                className="w-full"
                aria-invalid={state.field === "supplierId" ? true : undefined}
                aria-describedby="supplierId-hint"
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
            <p id="supplierId-hint" className="text-xs text-muted-foreground">
                            Approved suppliers that deliver to {options.region}.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="reroute-reason">Reason</Label>
            <Input
              id="reroute-reason"
              name="reason"
              required
              placeholder="Original supplier does not fulfil to this destination"
              aria-invalid={state.field === "reason" ? true : undefined}
                          />
          </div>
          {!options.carriersEnabled ? (
            <p className="text-xs text-destructive">
              Enable a carrier in store settings first.
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
      submitSize="sm"
      hidden={{ storeId: order.storeId, orderId: order.id }}
    >
      {(state) => (
        <div className="grid gap-1.5">
          <Label htmlFor="reference">Supplier purchase order reference</Label>
          <Input
            id="reference"
            name="reference"
            required
            placeholder="e.g. ALB-2049117"
            aria-invalid={state.field === "reference" ? true : undefined}
                      />
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
      submitSize="sm"
      hidden={{ storeId: order.storeId, orderId: order.id }}
    >
      {(state) => (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="carrier">Carrier</Label>
            <Select
              name="carrier"
              defaultValue={order.fulfillment.carrier ?? enabled[0]?.carrier ?? undefined}
              disabled={enabled.length === 0}
            >
              <SelectTrigger
                id="carrier"
                className="w-full"
                aria-invalid={state.field === "carrier" ? true : undefined}
              >
                <SelectValue placeholder={enabled.length === 0 ? "No carriers enabled" : undefined} />
              </SelectTrigger>
              <SelectContent>
                {enabled.map((c) => (
                  <SelectItem key={c.carrier} value={c.carrier}>
                    {CARRIER_LABELS[c.carrier]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
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
      submitVariant="destructive" submitSize="sm"
      hidden={{ storeId: order.storeId, orderId: order.id }}
    >
      {(state) => (
        <div className="grid gap-1.5">
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
 * Money leaving the store's Stripe account, so the entered amount and reason
 * are confirmed in an alert dialog before the action runs. The dialog's button
 * submits this form by id, because the dialog itself is rendered in a portal
 * outside it.
 */
export function RefundForm({ order }: { order: Order }) {
  const refunded = order.refunds.reduce((sum, r) => sum + r.amount, 0);
  const remaining = order.total - refunded;
  const formId = `refund-${order.id}`;

  const [{ state, attempt }, formAction, pending] = useSubmission<ActionState>(recordRefund, {
    status: "idle",
  });
  const { formRef, capture } = useValueRestore(state.status, attempt);

  return (
    <form
      id={formId}
      ref={formRef}
      action={(formData: FormData) => {
        capture(formData);
        formAction(formData);
      }}
      noValidate
    >
      <SuccessToast state={state} />
      <input type="hidden" name="storeId" value={order.storeId} />
      <input type="hidden" name="orderId" value={order.id} />
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
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
          <div className="grid gap-1.5">
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
        <Label htmlFor="cancel" className="cursor-pointer font-normal text-inksoft">
          <input id="cancel" type="checkbox" name="cancel" className="size-4 accent-primary" />
          Also cancel the order
        </Label>
      </div>
      <FormStatus state={state} />
      <div className="mt-5">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="destructive" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Record refund"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Record refund</AlertDialogTitle>
              <AlertDialogDescription>
                The amount will be refunded to the customer. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction type="submit" form={formId} variant="destructive" disabled={pending}>
                Record refund
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </form>
  );
}

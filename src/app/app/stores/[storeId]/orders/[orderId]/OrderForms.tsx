"use client";

import {
  addTracking,
  raiseException,
  recordManualSubmission,
  recordRefund,
  rerouteToSupplier,
} from "@/app/actions/orders";
import { ActionForm } from "@/components/forms";
import type { Order, RoutingOptions, Store, SupplierChoice } from "@/lib/types";
import { CARRIER_LABELS, toMajorString } from "@/lib/util";

const SUPPLIER_KINDS: Record<SupplierChoice["kind"], string> = {
  print_on_demand: "Print on demand",
  manufacturer: "Manufacturer",
  sourcing_marketplace: "Sourcing marketplace",
};

function choiceLabel(choice: SupplierChoice): string {
  const lead = `${choice.leadTimeDays[0]}–${choice.leadTimeDays[1]} day lead time`;
  return `${choice.name} — ${SUPPLIER_KINDS[choice.kind]}, ${lead}${choice.current ? " (current supplier)" : ""}`;
}

/**
 * Picks the production partner for a job automatic routing could not place.
 * Only suppliers that are approved, produce in the destination's region and
 * make everything on the order are offered; when that list is empty the panel
 * says so plainly and sends the order manager to the manual purchase order
 * field instead of showing a control that cannot work.
 */
export function SupplierPickerForm({ order, options }: { order: Order; options: RoutingOptions }) {
  const needs = options.requirements.map((r) => r.label).join(", ");

  if (options.available.length === 0) {
    return (
      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
        <p className="font-semibold">No approved supplier can produce this order for {options.destination}.</p>
        <p className="mt-1">
          Nothing on the approved list covers {options.region} and makes {needs || "these items"}.
          {options.manualOnly.length > 0 ? (
            <>
              {" "}
              {options.manualOnly.map((s) => s.name).join(", ")} produce
              {options.manualOnly.length === 1 ? "s" : ""} in {options.region} but{" "}
              {options.manualOnly.length === 1 ? "has" : "have"} no order submission API.
            </>
          ) : null}{" "}
          Raise the purchase order with a partner yourself and record its reference below, or refund the
          shopper.
        </p>
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
      hidden={{ storeId: order.storeId, orderId: order.id }}
    >
      {(state) => (
        <div className="space-y-3">
          <div>
            <label htmlFor="supplierId" className="field-label text-xs">
              Alternative production partner
            </label>
            <select
              id="supplierId"
              name="supplierId"
              defaultValue={options.available.find((s) => !s.current)?.id ?? options.available[0].id}
              aria-invalid={state.field === "supplierId" ? true : undefined}
              aria-describedby="supplierId-hint"
              className={state.field === "supplierId" ? "input input-error py-1.5" : "input py-1.5"}
            >
              {options.available.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choiceLabel(choice)}
                </option>
              ))}
            </select>
            <p id="supplierId-hint" className="field-hint">
              Approved partners that produce in {options.region} and make {needs || "these items"}.
            </p>
          </div>
          <div>
            <label htmlFor="reroute-reason" className="field-label text-xs">
              Why is it moving?
            </label>
            <input
              id="reroute-reason"
              name="reason"
              required
              placeholder="Original supplier does not fulfil to this destination"
              aria-invalid={state.field === "reason" ? true : undefined}
              aria-describedby="reroute-reason-hint"
              className={state.field === "reason" ? "input input-error py-1.5" : "input py-1.5"}
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
      hidden={{ storeId: order.storeId, orderId: order.id }}
    >
      {(state) => (
        <div>
          <label htmlFor="reference" className="field-label text-xs">
            Supplier purchase order reference
          </label>
          <input
            id="reference"
            name="reference"
            required
            placeholder="e.g. ALB-2049117"
            aria-invalid={state.field === "reference" ? true : undefined}
            aria-describedby="reference-hint"
            className={state.field === "reference" ? "input input-error py-1.5" : "input py-1.5"}
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
      hidden={{ storeId: order.storeId, orderId: order.id }}
    >
      {(state) => (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="carrier" className="field-label text-xs">
              Carrier
            </label>
            <select
              id="carrier"
              name="carrier"
              defaultValue={order.fulfillment.carrier ?? enabled[0]?.carrier ?? ""}
              aria-invalid={state.field === "carrier" ? true : undefined}
              className={state.field === "carrier" ? "input input-error py-1.5" : "input py-1.5"}
            >
              {enabled.length === 0 ? <option value="">No carriers enabled</option> : null}
              {enabled.map((c) => (
                <option key={c.carrier} value={c.carrier}>
                  {CARRIER_LABELS[c.carrier]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="trackingNumber" className="field-label text-xs">
              Tracking number
            </label>
            <input
              id="trackingNumber"
              name="trackingNumber"
              defaultValue={order.fulfillment.trackingNumber ?? ""}
              placeholder="Leave blank to generate one"
              aria-invalid={state.field === "trackingNumber" ? true : undefined}
              className={state.field === "trackingNumber" ? "input input-error py-1.5" : "input py-1.5"}
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
      hidden={{ storeId: order.storeId, orderId: order.id }}
    >
      {(state) => (
        <div>
          <label htmlFor="note" className="field-label text-xs">
            What has gone wrong?
          </label>
          <textarea
            id="note"
            name="note"
            rows={2}
            required
            placeholder="Supplier cannot print the artwork at this size; awaiting a replacement file."
            aria-invalid={state.field === "note" ? true : undefined}
            className={state.field === "note" ? "input input-error py-1.5" : "input py-1.5"}
          />
        </div>
      )}
    </ActionForm>
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
      hidden={{ storeId: order.storeId, orderId: order.id }}
    >
      {(state) => (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="amount" className="field-label text-xs">
                Amount ({order.currency})
              </label>
              <input
                id="amount"
                name="amount"
                inputMode="decimal"
                defaultValue={toMajorString(Math.max(0, remaining), order.currency)}
                required
                aria-invalid={state.field === "amount" ? true : undefined}
                className={state.field === "amount" ? "input input-error py-1.5" : "input py-1.5"}
              />
            </div>
            <div>
              <label htmlFor="reason" className="field-label text-xs">
                Reason
              </label>
              <input
                id="reason"
                name="reason"
                required
                placeholder="Shopper cancelled before production"
                aria-invalid={state.field === "reason" ? true : undefined}
                className={state.field === "reason" ? "input input-error py-1.5" : "input py-1.5"}
              />
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-inksoft">
            <input type="checkbox" name="cancel" className="h-4 w-4 accent-brand-600" />
            Also cancel the order
          </label>
        </div>
      )}
    </ActionForm>
  );
}

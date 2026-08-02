"use client";

import { addTracking, raiseException, recordManualSubmission, recordRefund } from "@/app/actions/orders";
import { ActionForm } from "@/components/forms";
import type { Order, Store } from "@/lib/types";
import { CARRIER_LABELS, toMajorString } from "@/lib/util";

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

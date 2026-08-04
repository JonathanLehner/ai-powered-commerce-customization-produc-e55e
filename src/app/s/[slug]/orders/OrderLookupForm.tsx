"use client";

import { lookupOrder } from "@/app/actions/shop";
import { ActionForm } from "@/components/forms";

export function OrderLookupForm({ slug, code = "" }: { slug: string; code?: string }) {
  return (
    <ActionForm
      action={lookupOrder}
      submitLabel="Show my order"
      pendingLabel="Checking…"
      hidden={{ slug }}
      className="card mt-6 p-5"
    >
      {(state) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="code" className="field-label">
                Order code
              </label>
              <input
                id="code"
                name="code"
                defaultValue={code}
                placeholder="ORD-12345678"
                required
                aria-invalid={state.field === "code" ? true : undefined}
                aria-describedby="code-hint"
                className={state.field === "code" ? "input input-error" : "input"}
              />
              <p id="code-hint" className="field-hint">
                On your order confirmation, starting with ORD-.
              </p>
            </div>
            <div>
              <label htmlFor="email" className="field-label">
                Email on the order
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                aria-invalid={state.field === "email" ? true : undefined}
                className={state.field === "email" ? "input input-error" : "input"}
              />
              <p className="field-hint">The address the confirmation was sent to.</p>
            </div>
          </div>
        </>
      )}
    </ActionForm>
  );
}

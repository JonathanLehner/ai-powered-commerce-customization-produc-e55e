"use client";

import { lookupOrder } from "@/app/actions/shop";
import { ActionForm } from "@/components/forms";
import type { StorefrontCopy } from "@/lib/i18n";

export function OrderLookupForm({
  slug,
  code = "",
  t,
}: {
  slug: string;
  code?: string;
  t: StorefrontCopy["order"];
}) {
  return (
    <ActionForm
      action={lookupOrder}
      submitLabel={t.lookupSubmit}
      pendingLabel={t.lookupPending}
      hidden={{ slug }}
      className="card mt-6 p-5"
    >
      {(state) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="code" className="field-label">
                {t.orderCode}
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
                {t.orderCodeHint}
              </p>
            </div>
            <div>
              <label htmlFor="email" className="field-label">
                {t.emailOnOrder}
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
              <p className="field-hint">{t.emailHint}</p>
            </div>
          </div>
        </>
      )}
    </ActionForm>
  );
}

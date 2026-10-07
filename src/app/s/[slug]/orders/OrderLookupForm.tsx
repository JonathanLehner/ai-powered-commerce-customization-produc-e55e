"use client";

import { lookupOrder } from "@/app/actions/shop";
import { ActionForm } from "@/components/forms";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
      className="mt-7 rounded-card border border-border bg-card p-5"
    >
      {(state) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="code">{t.orderCode}</Label>
              <Input
                id="code"
                name="code"
                defaultValue={code}
                placeholder="ORD-12345678"
                required
                aria-invalid={state.field === "code" ? true : undefined}
                aria-describedby="code-hint"
                className="mt-1.5 font-mono tabular-nums"
              />
              <p id="code-hint" className="field-hint">
                {t.orderCodeHint}
              </p>
            </div>
            <div>
              <Label htmlFor="email">{t.emailOnOrder}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                aria-invalid={state.field === "email" ? true : undefined}
                className="mt-1.5"
              />
              <p className="field-hint">{t.emailHint}</p>
            </div>
          </div>
        </>
      )}
    </ActionForm>
  );
}

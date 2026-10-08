"use client";

import { lookupOrder } from "@/app/actions/shop";
import { ActionForm } from "@/components/forms";
import { Card } from "@/components/ui/card";
import type { StorefrontCopy } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <Card asChild className="mt-6 block overflow-visible p-5">
    <ActionForm
      action={lookupOrder}
      submitLabel={t.lookupSubmit}
      pendingLabel={t.lookupPending}
      submitSize="lg"
      hidden={{ slug }}
    >
      {(state) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="code">
                {t.orderCode}
              </Label>
              <Input
                id="code"
                name="code"
                defaultValue={code}
                placeholder="ORD-12345678"
                required
                aria-invalid={state.field === "code" ? true : undefined}
                aria-describedby="code-hint"
                className="mt-1.5"
              />
              <p id="code-hint" className="mt-1.5 text-xs text-muted-foreground">
                {t.orderCodeHint}
              </p>
            </div>
            <div>
              <Label htmlFor="email">
                {t.emailOnOrder}
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                aria-invalid={state.field === "email" ? true : undefined}
                className="mt-1.5"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">{t.emailHint}</p>
            </div>
          </div>
        </>
      )}
    </ActionForm>
    </Card>
  );
}

"use client";

import { useTranslations } from "next-intl";
import { lookupOrder } from "@/app/actions/shop";
import { ActionForm } from "@/components/forms";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OrderLookupForm({
  slug,
  code = "",
}: {
  slug: string;
  code?: string;
}) {
  const t = useTranslations("storefront.order");
  return (
    <Card asChild className="mt-6 block overflow-visible p-5">
    <ActionForm
      action={lookupOrder}
      submitLabel={t("lookupSubmit")}
      pendingLabel={t("lookupPending")}
      submitSize="lg"
      hidden={{ slug }}
    >
      {(state) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="code">
                {t("orderCode")}
              </Label>
              <Input
                id="code"
                name="code"
                defaultValue={code}
                placeholder="ORD-12345678"
                required
                aria-invalid={state.field === "code" ? true : undefined}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="email">
                {t("emailOnOrder")}
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
            </div>
          </div>
        </>
      )}
    </ActionForm>
    </Card>
  );
}

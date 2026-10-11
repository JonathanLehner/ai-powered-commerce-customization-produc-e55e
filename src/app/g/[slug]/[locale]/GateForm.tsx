"use client";

import { useTranslations } from "next-intl";
import { unlockGiftCatalogue } from "@/app/actions/gifting";
import { ActionForm } from "@/components/forms";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Invite-gated catalogues let somebody in on their work email, nothing else. */
export function GateForm({ slug }: { slug: string }) {
  const t = useTranslations("storefront.gift");
  return (
    <ActionForm
      action={unlockGiftCatalogue}
      submitLabel={t("gateSubmit")}
      pendingLabel={t("gatePending")}
      hidden={{ slug }}
    >
      {(state) => (
        <div>
          <Label htmlFor="email">
            {t("gateEmail")}
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
      )}
    </ActionForm>
  );
}

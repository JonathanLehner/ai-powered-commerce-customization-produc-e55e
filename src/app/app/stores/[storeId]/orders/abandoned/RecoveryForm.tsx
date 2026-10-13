"use client";

import { useTranslations } from "next-intl";
import { saveCheckoutRecovery } from "@/app/actions/orders";
import { ActionForm } from "@/components/forms";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RECOVERY_DELAY_MAX, RECOVERY_DELAY_MIN } from "@/lib/order-ops";
import type { CheckoutRecoverySettings } from "@/lib/types";

/** The one abandoned checkout email: on or off, and how long after checkout it goes. */
export function RecoveryForm({ storeId, settings }: { storeId: string; settings: CheckoutRecoverySettings }) {
  const t = useTranslations("abandoned");
  return (
    <ActionForm
      action={saveCheckoutRecovery}
      submitLabel={t("save")}
      submitSize="sm"
      hidden={{ storeId }}
    >
      {(state) => (
        <div className="space-y-4">
          <Label htmlFor="recovery-enabled" className="cursor-pointer font-normal text-inksoft">
            <input
              id="recovery-enabled"
              type="checkbox"
              name="enabled"
              defaultChecked={settings.enabled}
              className="size-4 accent-primary"
            />
            {t("enabled")}
          </Label>
          <div className="grid max-w-xs gap-1.5">
            <Label htmlFor="recovery-delay">{t("delay")}</Label>
            <Input
              id="recovery-delay"
              name="delayHours"
              type="number"
              inputMode="numeric"
              min={RECOVERY_DELAY_MIN}
              max={RECOVERY_DELAY_MAX}
              defaultValue={settings.delayHours}
              aria-describedby="recovery-delay-hint"
              aria-invalid={state.field === "delayHours" ? true : undefined}
            />
            <p id="recovery-delay-hint" className="text-xs text-muted-foreground">
              {t("delayHint")}
            </p>
          </div>
        </div>
      )}
    </ActionForm>
  );
}

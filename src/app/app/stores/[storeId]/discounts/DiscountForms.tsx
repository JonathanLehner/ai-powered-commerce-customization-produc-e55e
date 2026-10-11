"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { createDiscount, saveDiscount } from "@/app/actions/discounts";
import { ActionForm, Field } from "@/components/forms";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { MAX_DISCOUNT_PERCENTAGE } from "@/lib/discounts";
import type { ActionState } from "@/app/actions/stores";
import type { DiscountCode, DiscountKind } from "@/lib/types";
import { toMajorString } from "@/lib/util";

/**
 * The terms both forms share. The value field means two different things, so the
 * label follows the kind that is selected rather than explaining both at once.
 */
function Terms({
  state,
  currency,
  kind,
  onKindChange,
  defaults,
  prefix,
}: {
  state: ActionState;
  currency: string;
  kind: DiscountKind;
  onKindChange: (kind: DiscountKind) => void;
  /** Keeps the field ids unique when several of these forms share a page. */
  prefix: string;
  defaults: {
    value: string;
    minimumSubtotal: string;
    expiresAt: string;
    usageLimit: string;
    active: boolean;
  };
}) {
  const t = useTranslations("discounts");
  return (
    <>
      <Field label={t("discount")} htmlFor={`${prefix}-kind`}>
        <Select
          name="kind"
          value={kind}
          onValueChange={(next) => onKindChange(next as DiscountKind)}
        >
          <SelectTrigger id={`${prefix}-kind`} className="mt-1.5 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="percentage">{t("percentage")}</SelectItem>
            <SelectItem value="fixed">{t("fixed")}</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field
        label={kind === "percentage" ? t("percentage") : t("amountLabel", { currency })}
        htmlFor={`${prefix}-value`}
        hint={
          kind === "percentage"
            ? t("percentHint", { max: MAX_DISCOUNT_PERCENTAGE })
            : t("amountHint")
        }
      >
        <Input
          id={`${prefix}-value`}
          name="value"
          inputMode="decimal"
          defaultValue={defaults.value}
          className="mt-1.5 tabular-nums"
          aria-invalid={state.field === "value" ? true : undefined}
        />
      </Field>
      <Field
        label={t("minimumLabel", { currency })}
        htmlFor={`${prefix}-minimumSubtotal`}
        hint={t("minimumHint")}
      >
        <Input
          id={`${prefix}-minimumSubtotal`}
          name="minimumSubtotal"
          inputMode="decimal"
          defaultValue={defaults.minimumSubtotal}
          className="mt-1.5 tabular-nums"
          aria-invalid={state.field === "minimumSubtotal" ? true : undefined}
        />
      </Field>
      <Field label={t("expiresLabel")} htmlFor={`${prefix}-expiresAt`} hint={t("optional")}>
        <Input
          id={`${prefix}-expiresAt`}
          name="expiresAt"
          type="date"
          defaultValue={defaults.expiresAt}
          className="mt-1.5"
          aria-invalid={state.field === "expiresAt" ? true : undefined}
        />
      </Field>
      <Field label={t("usageLimit")} htmlFor={`${prefix}-usageLimit`} hint={t("optional")}>
        <Input
          id={`${prefix}-usageLimit`}
          name="usageLimit"
          inputMode="numeric"
          defaultValue={defaults.usageLimit}
          className="mt-1.5 tabular-nums"
          aria-invalid={state.field === "usageLimit" ? true : undefined}
        />
      </Field>
      <div className="flex items-end">
        <div className="flex items-start gap-2.5 text-sm text-inksoft">
          <Switch
            id={`${prefix}-active`}
            name="active"
            defaultChecked={defaults.active}
            className="mt-0.5"
          />
          <Label htmlFor={`${prefix}-active`} className="block cursor-pointer font-normal">
            {t("active")}
          </Label>
        </div>
      </div>
    </>
  );
}

export function DiscountCreateForm({ storeId, currency }: { storeId: string; currency: string }) {
  const [kind, setKind] = useState<DiscountKind>("percentage");
  const t = useTranslations("discounts");

  return (
    <Card asChild>
    <ActionForm
      action={createDiscount}
      submitLabel={t("create")}
      pendingLabel={t("creating")}
      hidden={{ storeId }}
      actionsClassName="px-(--card-spacing)"
    >
      {(state) => (
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("code")}
            htmlFor="code"
            hint={t("codeHint")}
          >
            <Input
              id="code"
              name="code"
              placeholder="SPRING10"
              className="mt-1.5 font-mono uppercase"
              aria-invalid={state.field === "code" ? true : undefined}
            />
          </Field>
          <Terms
            state={state}
            currency={currency}
            kind={kind}
            onKindChange={setKind}
            prefix="new"
            defaults={{ value: "10", minimumSubtotal: "", expiresAt: "", usageLimit: "", active: true }}
          />
        </CardContent>
      )}
    </ActionForm>
    </Card>
  );
}

export function DiscountEditForm({ code }: { code: DiscountCode }) {
  const [kind, setKind] = useState<DiscountKind>(code.kind);
  const t = useTranslations("discounts");

  return (
    <ActionForm
      action={saveDiscount}
      submitLabel={t("save")}
      hidden={{ storeId: code.storeId, discountId: code.id }}
    >
      {(state) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <Terms
            state={state}
            currency={code.currency}
            kind={kind}
            onKindChange={setKind}
            prefix={code.id}
            defaults={{
              value:
                code.kind === "percentage" ? String(code.value) : toMajorString(code.value, code.currency),
              minimumSubtotal:
                code.minimumSubtotal > 0 ? toMajorString(code.minimumSubtotal, code.currency) : "",
              expiresAt: code.expiresAt ? code.expiresAt.slice(0, 10) : "",
              usageLimit: code.usageLimit === null ? "" : String(code.usageLimit),
              active: code.active,
            }}
          />
        </div>
      )}
    </ActionForm>
  );
}

"use client";

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
  return (
    <>
      <Field label="Discount" htmlFor={`${prefix}-kind`}>
        <Select
          name="kind"
          value={kind}
          onValueChange={(next) => onKindChange(next as DiscountKind)}
        >
          <SelectTrigger id={`${prefix}-kind`} className="mt-1.5 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="percentage">Percentage off</SelectItem>
            <SelectItem value="fixed">Fixed amount off</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field
        label={kind === "percentage" ? "Percentage off" : `Amount off (${currency})`}
        htmlFor={`${prefix}-value`}
        hint={
          kind === "percentage"
            ? `A whole number from 1 to ${MAX_DISCOUNT_PERCENTAGE}.`
            : "Converted into whatever currency the shopper is buying in."
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
        label={`Minimum basket (${currency})`}
        htmlFor={`${prefix}-minimumSubtotal`}
        hint="Leave empty for no minimum. Checked against the goods, before shipping and tax."
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
      <Field label="Expires" htmlFor={`${prefix}-expiresAt`} hint="The code works to the end of this day. Empty for no expiry.">
        <Input
          id={`${prefix}-expiresAt`}
          name="expiresAt"
          type="date"
          defaultValue={defaults.expiresAt}
          className="mt-1.5"
          aria-invalid={state.field === "expiresAt" ? true : undefined}
        />
      </Field>
      <Field label="Usage limit" htmlFor={`${prefix}-usageLimit`} hint="Total redemptions allowed. Empty for no limit.">
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
            Active
            <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
              An inactive code is refused in the basket and at checkout, and drops off any basket holding it.
            </span>
          </Label>
        </div>
      </div>
    </>
  );
}

export function DiscountCreateForm({ storeId, currency }: { storeId: string; currency: string }) {
  const [kind, setKind] = useState<DiscountKind>("percentage");

  return (
    <Card asChild>
    <ActionForm
      action={createDiscount}
      submitLabel="Create code"
      pendingLabel="Creating…"
      hidden={{ storeId }}
      actionsClassName="px-(--card-spacing)"
    >
      {(state) => (
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Code"
            htmlFor="code"
            hint="Letters and digits only — what the shopper types. It cannot be changed later."
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

  return (
    <ActionForm
      action={saveDiscount}
      submitLabel="Save code"
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

"use client";

import { useState } from "react";
import { createDiscount, saveDiscount } from "@/app/actions/discounts";
import { ActionForm, Field } from "@/components/forms";
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
        <select
          id={`${prefix}-kind`}
          name="kind"
          value={kind}
          onChange={(event) => onKindChange(event.currentTarget.value as DiscountKind)}
          className="input"
        >
          <option value="percentage">Percentage off</option>
          <option value="fixed">Fixed amount off</option>
        </select>
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
        <input
          id={`${prefix}-value`}
          name="value"
          inputMode="decimal"
          defaultValue={defaults.value}
          className={state.field === "value" ? "input input-error" : "input"}
        />
      </Field>
      <Field
        label={`Minimum basket (${currency})`}
        htmlFor={`${prefix}-minimumSubtotal`}
        hint="Leave empty for no minimum. Checked against the goods, before shipping and tax."
      >
        <input
          id={`${prefix}-minimumSubtotal`}
          name="minimumSubtotal"
          inputMode="decimal"
          defaultValue={defaults.minimumSubtotal}
          className={state.field === "minimumSubtotal" ? "input input-error" : "input"}
        />
      </Field>
      <Field label="Expires" htmlFor={`${prefix}-expiresAt`} hint="The code works to the end of this day. Empty for no expiry.">
        <input
          id={`${prefix}-expiresAt`}
          name="expiresAt"
          type="date"
          defaultValue={defaults.expiresAt}
          className={state.field === "expiresAt" ? "input input-error" : "input"}
        />
      </Field>
      <Field label="Usage limit" htmlFor={`${prefix}-usageLimit`} hint="Total redemptions allowed. Empty for no limit.">
        <input
          id={`${prefix}-usageLimit`}
          name="usageLimit"
          inputMode="numeric"
          defaultValue={defaults.usageLimit}
          className={state.field === "usageLimit" ? "input input-error" : "input"}
        />
      </Field>
      <div className="flex items-end">
        <label className="flex items-start gap-2 text-sm text-inksoft">
          <input
            type="checkbox"
            name="active"
            defaultChecked={defaults.active}
            className="mt-0.5 h-4 w-4 rounded border-line"
          />
          <span>
            Active
            <span className="mt-0.5 block text-xs text-muted-foreground">
              An inactive code is refused in the basket and at checkout, and drops off any basket holding it.
            </span>
          </span>
        </label>
      </div>
    </>
  );
}

export function DiscountCreateForm({ storeId, currency }: { storeId: string; currency: string }) {
  const [kind, setKind] = useState<DiscountKind>("percentage");

  return (
    <ActionForm
      action={createDiscount}
      submitLabel="Create code"
      pendingLabel="Creating…"
      hidden={{ storeId }}
      className="card p-5"
    >
      {(state) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Code"
            htmlFor="code"
            hint="Letters and digits only — what the shopper types. It cannot be changed later."
          >
            <input
              id="code"
              name="code"
              placeholder="SPRING10"
              className={state.field === "code" ? "input input-error font-mono uppercase" : "input font-mono uppercase"}
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
        </div>
      )}
    </ActionForm>
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

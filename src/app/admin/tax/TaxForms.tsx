"use client";

import { saveTaxBracket } from "@/app/actions/admin";
import { ActionForm } from "@/components/forms";
import type { TaxBracket } from "@/lib/types";
import { REGION_OPTIONS } from "@/lib/util";

function Fields({
  bracket,
  state,
  prefix,
}: {
  bracket?: TaxBracket;
  state: { field?: string };
  prefix: string;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label htmlFor={`${prefix}-name`} className="field-label">
            Bracket name
          </label>
          <input
            id={`${prefix}-name`}
            name="name"
            defaultValue={bracket?.name}
            required
            aria-invalid={state.field === "name" ? true : undefined}
            className={state.field === "name" ? "input input-error" : "input"}
          />
        </div>
        <div>
          <label htmlFor={`${prefix}-rate`} className="field-label">
            Rate (%)
          </label>
          <input
            id={`${prefix}-rate`}
            name="rate"
            type="number"
            step="0.01"
            min={0}
            max={50}
            defaultValue={bracket?.rate ?? 20}
            required
            aria-invalid={state.field === "rate" ? true : undefined}
            className={state.field === "rate" ? "input input-error" : "input"}
          />
        </div>
        <div>
          <label htmlFor={`${prefix}-code`} className="field-label">
            Code
          </label>
          <input
            id={`${prefix}-code`}
            name="code"
            defaultValue={bracket?.code}
            required
            placeholder="STD-20"
            aria-invalid={state.field === "code" ? true : undefined}
            className={state.field === "code" ? "input input-error" : "input"}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${prefix}-description`} className="field-label">
            Description
          </label>
          <input
            id={`${prefix}-description`}
            name="description"
            defaultValue={bracket?.description}
            placeholder="When a store should choose this bracket"
            className="input"
          />
        </div>
      </div>

      <fieldset className="mt-4">
        <legend className="field-label">Regions</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {REGION_OPTIONS.map((region) => (
            <label
              key={region}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs hover:bg-canvas has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50/60"
            >
              <input
                type="checkbox"
                name="regions"
                value={region}
                defaultChecked={bracket?.regions.includes(region)}
                className="h-3.5 w-3.5 accent-brand-600"
              />
              {region}
            </label>
          ))}
        </div>
        {state.field === "regions" ? (
          <p className="field-hint text-rose-600">Choose at least one region.</p>
        ) : null}
      </fieldset>
    </>
  );
}

export function EditBracketForm({ bracket }: { bracket: TaxBracket }) {
  return (
    <ActionForm
      action={saveTaxBracket}
      submitLabel="Save bracket"
      submitClassName="btn-secondary btn-sm"
      hidden={{ bracketId: bracket.id }}
    >
      {(state) => <Fields bracket={bracket} state={state} prefix={bracket.id} />}
    </ActionForm>
  );
}

export function NewBracketForm() {
  return (
    <ActionForm action={saveTaxBracket} submitLabel="Create tax bracket" className="card p-5">
      {(state) => (
        <>
          <h2 className="text-base font-semibold text-ink">Add a tax bracket</h2>
          <p className="mt-1 text-sm text-muted">
            Brackets are global. Store managers pick one per product; they never set a rate themselves.
          </p>
          <div className="mt-5">
            <Fields state={state} prefix="new" />
          </div>
        </>
      )}
    </ActionForm>
  );
}

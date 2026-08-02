"use client";

import { addSupplier, saveSupplierRegions } from "@/app/actions/admin";
import { ActionForm } from "@/components/forms";
import type { Supplier } from "@/lib/types";
import { REGION_OPTIONS } from "@/lib/util";

export function SupplierRegionsForm({ supplier }: { supplier: Supplier }) {
  return (
    <ActionForm
      action={saveSupplierRegions}
      submitLabel="Save regions"
      submitClassName="btn-secondary btn-sm"
      hidden={{ supplierId: supplier.id }}
    >
      {(state) => (
        <>
          <fieldset>
            <legend className="field-label text-xs">Fulfilment regions</legend>
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
                    defaultChecked={supplier.regions.includes(region)}
                    className="h-3.5 w-3.5 accent-brand-600"
                  />
                  {region}
                </label>
              ))}
            </div>
            {state.field === "regions" ? (
              <p className="field-hint text-rose-600">At least one region is required.</p>
            ) : null}
          </fieldset>
          <div className="mt-3">
            <label htmlFor={`notes-${supplier.id}`} className="field-label text-xs">
              Operational notes
            </label>
            <textarea
              id={`notes-${supplier.id}`}
              name="notes"
              rows={2}
              defaultValue={supplier.notes}
              className="input py-1.5 text-sm"
            />
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function AddSupplierForm() {
  return (
    <ActionForm action={addSupplier} submitLabel="Add for review" className="card p-5">
      {(state) => (
        <>
          <h2 className="text-base font-semibold text-ink">Add a supplier</h2>
          <p className="mt-1 text-sm text-muted">
            New suppliers land in review. Stores cannot source from them until they are approved.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="supplier-name" className="field-label">
                Name
              </label>
              <input
                id="supplier-name"
                name="name"
                required
                aria-invalid={state.field === "name" ? true : undefined}
                className={state.field === "name" ? "input input-error" : "input"}
              />
            </div>
            <div>
              <label htmlFor="supplier-website" className="field-label">
                Website
              </label>
              <input
                id="supplier-website"
                name="website"
                placeholder="https://"
                required
                aria-invalid={state.field === "website" ? true : undefined}
                className={state.field === "website" ? "input input-error" : "input"}
              />
            </div>
            <div>
              <label htmlFor="supplier-kind" className="field-label">
                Type
              </label>
              <select id="supplier-kind" name="kind" defaultValue="print_on_demand" className="input">
                <option value="print_on_demand">Print on demand</option>
                <option value="manufacturer">Manufacturer</option>
                <option value="sourcing_marketplace">Sourcing marketplace</option>
              </select>
            </div>
            <div>
              <label htmlFor="supplier-integration" className="field-label">
                Integration
              </label>
              <select id="supplier-integration" name="integration" defaultValue="api" className="input">
                <option value="api">Order API</option>
                <option value="manual">Manual purchase orders</option>
              </select>
              <p className="field-hint">Manual suppliers flag every order for a human.</p>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="supplier-summary" className="field-label">
                What is this supplier for?
              </label>
              <textarea
                id="supplier-summary"
                name="summary"
                rows={3}
                required
                minLength={20}
                aria-invalid={state.field === "summary" ? true : undefined}
                className={state.field === "summary" ? "input input-error" : "input"}
              />
            </div>
            <fieldset className="sm:col-span-2">
              <legend className="field-label">Fulfilment regions</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {REGION_OPTIONS.map((region) => (
                  <label
                    key={region}
                    className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs hover:bg-canvas has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50/60"
                  >
                    <input type="checkbox" name="regions" value={region} className="h-3.5 w-3.5 accent-brand-600" />
                    {region}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </>
      )}
    </ActionForm>
  );
}

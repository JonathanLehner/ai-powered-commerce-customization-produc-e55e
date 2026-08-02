"use client";

import { saveCatalogItem } from "@/app/actions/admin";
import { ActionForm } from "@/components/forms";
import type { CatalogProduct } from "@/lib/types";
import { REGION_OPTIONS, toMajorString } from "@/lib/util";

export function CatalogItemForm({ item }: { item: CatalogProduct }) {
  return (
    <ActionForm
      action={saveCatalogItem}
      submitLabel="Save catalog product"
      hidden={{ catalogId: item.id }}
      className="space-y-5"
    >
      {(state) => (
        <>
          <section className="card p-5">
            <h2 className="text-base font-semibold text-ink">Product</h2>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div>
                <label htmlFor="name" className="field-label">
                  Name
                </label>
                <input
                  id="name"
                  name="name"
                  defaultValue={item.name}
                  required
                  aria-invalid={state.field === "name" ? true : undefined}
                  className={state.field === "name" ? "input input-error" : "input"}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="availability" className="field-label">
                    Availability
                  </label>
                  <select id="availability" name="availability" defaultValue={item.availability} className="input">
                    <option value="available">Available</option>
                    <option value="limited">Limited</option>
                    <option value="discontinued">Discontinued</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="status" className="field-label">
                    Catalog status
                  </label>
                  <select id="status" name="status" defaultValue={item.status} className="input">
                    <option value="active">Active — stores can import</option>
                    <option value="retired">Retired — hidden from sourcing</option>
                  </select>
                </div>
              </div>
              <div className="lg:col-span-2">
                <label htmlFor="description" className="field-label">
                  Description
                </label>
                <textarea
                  id="description"
                  name="description"
                  rows={4}
                  defaultValue={item.description}
                  required
                  aria-invalid={state.field === "description" ? true : undefined}
                  className={state.field === "description" ? "input input-error" : "input"}
                />
              </div>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="text-base font-semibold text-ink">Costs ({item.currency})</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="baseCost" className="field-label">
                  Base cost
                </label>
                <input
                  id="baseCost"
                  name="baseCost"
                  inputMode="decimal"
                  defaultValue={toMajorString(item.baseCost, item.currency)}
                  required
                  aria-invalid={state.field === "baseCost" ? true : undefined}
                  className={state.field === "baseCost" ? "input input-error" : "input"}
                />
              </div>
              <div>
                <label htmlFor="customizationCost" className="field-label">
                  Customisation per print area
                </label>
                <input
                  id="customizationCost"
                  name="customizationCost"
                  inputMode="decimal"
                  defaultValue={toMajorString(item.customizationCostPerArea, item.currency)}
                  required
                  aria-invalid={state.field === "customizationCost" ? true : undefined}
                  className={state.field === "customizationCost" ? "input input-error" : "input"}
                />
              </div>
              <div>
                <label htmlFor="shippingEstimate" className="field-label">
                  Estimated shipping
                </label>
                <input
                  id="shippingEstimate"
                  name="shippingEstimate"
                  inputMode="decimal"
                  defaultValue={toMajorString(item.shippingEstimate, item.currency)}
                  required
                  aria-invalid={state.field === "shippingEstimate" ? true : undefined}
                  className={state.field === "shippingEstimate" ? "input input-error" : "input"}
                />
              </div>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="text-base font-semibold text-ink">Print areas</h2>
            <p className="mt-1 text-sm text-muted">
              Physical size and minimum resolution. Store artwork is pre-flighted against these numbers.
            </p>
            <div className="mt-4 relative overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-sm">
                <thead className="text-xs font-semibold uppercase tracking-wide text-muted">
                  <tr>
                    <th scope="col" className="py-2 pr-3">Area</th>
                    <th scope="col" className="py-2 pr-3">View</th>
                    <th scope="col" className="py-2 pr-3">Width (mm)</th>
                    <th scope="col" className="py-2 pr-3">Height (mm)</th>
                    <th scope="col" className="py-2 pr-3">Minimum DPI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {item.printAreas.map((area) => (
                    <tr key={area.id}>
                      <td className="py-2 pr-3 font-medium text-ink">{area.name}</td>
                      <td className="py-2 pr-3 text-muted">{area.view}</td>
                      <td className="py-2 pr-3">
                        <label htmlFor={`width_${area.id}`} className="sr-only">
                          Width for {area.name}
                        </label>
                        <input
                          id={`width_${area.id}`}
                          name={`width_${area.id}`}
                          type="number"
                          min={10}
                          defaultValue={area.widthMm}
                          className="input mt-0 w-24 py-1 text-sm"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <label htmlFor={`height_${area.id}`} className="sr-only">
                          Height for {area.name}
                        </label>
                        <input
                          id={`height_${area.id}`}
                          name={`height_${area.id}`}
                          type="number"
                          min={10}
                          defaultValue={area.heightMm}
                          className="input mt-0 w-24 py-1 text-sm"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <label htmlFor={`dpi_${area.id}`} className="sr-only">
                          Minimum DPI for {area.name}
                        </label>
                        <input
                          id={`dpi_${area.id}`}
                          name={`dpi_${area.id}`}
                          type="number"
                          min={72}
                          defaultValue={area.minDpi}
                          className="input mt-0 w-24 py-1 text-sm"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="text-base font-semibold text-ink">Variants and availability</h2>
            <div className="mt-4 relative overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-sm">
                <thead className="text-xs font-semibold uppercase tracking-wide text-muted">
                  <tr>
                    <th scope="col" className="py-2 pr-3">Variant</th>
                    <th scope="col" className="py-2 pr-3">SKU</th>
                    <th scope="col" className="py-2 pr-3">Base cost</th>
                    <th scope="col" className="py-2 pr-3">Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {item.variants.map((variant) => (
                    <tr key={variant.id}>
                      <td className="py-2 pr-3">
                        <span className="flex items-center gap-2">
                          <span
                            aria-hidden
                            className="h-3.5 w-3.5 rounded-full border border-line"
                            style={{ background: variant.colourHex }}
                          />
                          <span className="font-medium text-ink">{variant.name}</span>
                        </span>
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs text-muted">{variant.sku}</td>
                      <td className="py-2 pr-3">
                        <label htmlFor={`cost_${variant.id}`} className="sr-only">
                          Base cost for {variant.name}
                        </label>
                        <input
                          id={`cost_${variant.id}`}
                          name={`cost_${variant.id}`}
                          inputMode="decimal"
                          defaultValue={toMajorString(variant.baseCost, item.currency)}
                          className="input mt-0 w-24 py-1 text-sm"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <label htmlFor={`stock_${variant.id}`} className="sr-only">
                          Stock for {variant.name}
                        </label>
                        <select
                          id={`stock_${variant.id}`}
                          name={`stock_${variant.id}`}
                          defaultValue={variant.availability}
                          className="input mt-0 w-32 py-1 text-sm"
                        >
                          <option value="in_stock">In stock</option>
                          <option value="low_stock">Low stock</option>
                          <option value="out_of_stock">Out of stock</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card p-5">
            <fieldset>
              <legend className="text-base font-semibold text-ink">Fulfilment regions</legend>
              <p className="mt-1 text-sm text-muted">
                Orders shipping outside these regions are flagged for manual routing instead of being submitted.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {REGION_OPTIONS.map((region) => (
                  <label
                    key={region}
                    className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-sm hover:bg-canvas has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50/60"
                  >
                    <input
                      type="checkbox"
                      name="regions"
                      value={region}
                      defaultChecked={item.fulfillmentRegions.includes(region)}
                      className="h-4 w-4 accent-brand-600"
                    />
                    {region}
                  </label>
                ))}
              </div>
              {state.field === "regions" ? (
                <p className="field-hint text-rose-600">Choose at least one region.</p>
              ) : null}
            </fieldset>
          </section>
        </>
      )}
    </ActionForm>
  );
}

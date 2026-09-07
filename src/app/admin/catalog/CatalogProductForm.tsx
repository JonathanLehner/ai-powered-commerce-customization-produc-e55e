"use client";

import { useState } from "react";
import { saveCatalogItem } from "@/app/actions/admin";
import { ActionForm } from "@/components/forms";
import type { CatalogProduct, MockupView, Supplier } from "@/lib/types";
import { VIEW_LABELS } from "@/lib/types";
import { CURRENCY_OPTIONS, REGION_OPTIONS, toMajorString } from "@/lib/util";

/** A print area as the form edits it: numbers stay strings until the action parses them. */
interface AreaRow {
  key: string;
  id: string;
  name: string;
  view: MockupView;
  widthMm: string;
  heightMm: string;
  minDpi: string;
}

interface VariantRow {
  key: string;
  id: string;
  colour: string;
  colourHex: string;
  size: string;
  sku: string;
  baseCost: string;
  availability: "in_stock" | "low_stock" | "out_of_stock";
}

let rowCounter = 0;
function nextKey(prefix: string): string {
  rowCounter += 1;
  return `${prefix}${rowCounter}`;
}

function areaRows(item?: CatalogProduct): AreaRow[] {
  return (item?.printAreas ?? []).map((area) => ({
    key: nextKey("pa"),
    id: area.id,
    name: area.name,
    view: area.view,
    widthMm: String(area.widthMm),
    heightMm: String(area.heightMm),
    minDpi: String(area.minDpi),
  }));
}

function variantRows(item?: CatalogProduct): VariantRow[] {
  return (item?.variants ?? []).map((variant) => ({
    key: nextKey("vr"),
    id: variant.id,
    colour: variant.colour,
    colourHex: variant.colourHex,
    size: variant.size,
    sku: variant.sku,
    baseCost: toMajorString(variant.baseCost, item?.currency ?? "USD"),
    availability: variant.availability,
  }));
}

/**
 * The shared catalog editor. The same form creates a product and edits one: the
 * only difference is whether an id is posted with it, and whether the currency
 * can still be chosen — changing it later would reinterpret every stored amount.
 */
export function CatalogProductForm({
  item,
  suppliers,
  defaultSupplierId,
}: {
  item?: CatalogProduct;
  suppliers: Supplier[];
  defaultSupplierId?: string;
}) {
  const creating = !item;
  const [currency, setCurrency] = useState(item?.currency ?? "USD");
  const [areas, setAreas] = useState<AreaRow[]>(() =>
    item ? areaRows(item) : [
      { key: nextKey("pa"), id: "", name: "Front", view: "front", widthMm: "280", heightMm: "360", minDpi: "150" },
    ],
  );
  const [variants, setVariants] = useState<VariantRow[]>(() =>
    item ? variantRows(item) : [
      {
        key: nextKey("vr"),
        id: "",
        colour: "White",
        colourHex: "#ffffff",
        size: "M",
        sku: "",
        baseCost: "",
        availability: "in_stock",
      },
    ],
  );

  const updateArea = (key: string, patch: Partial<AreaRow>) =>
    setAreas((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const updateVariant = (key: string, patch: Partial<VariantRow>) =>
    setVariants((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  return (
    <ActionForm
      action={saveCatalogItem}
      submitLabel={creating ? "Create catalog product" : "Save catalog product"}
      pendingLabel={creating ? "Creating…" : "Saving…"}
      hidden={{
        catalogId: item?.id ?? "",
        // The row tables are posted as JSON: how many rows there are is decided
        // in the browser, so a fixed set of named fields cannot describe them.
        printAreas: JSON.stringify(
          areas.map((row) => ({
            id: row.id,
            name: row.name,
            view: row.view,
            widthMm: row.widthMm,
            heightMm: row.heightMm,
            minDpi: row.minDpi,
          })),
        ),
        variants: JSON.stringify(
          variants.map((row) => ({
            id: row.id,
            colour: row.colour,
            colourHex: row.colourHex,
            size: row.size,
            sku: row.sku,
            baseCost: row.baseCost,
            availability: row.availability,
          })),
        ),
      }}
      className="space-y-5"
    >
      {(state) => (
        <>
          <section className="card p-5">
            <h2 className="text-base font-semibold text-ink">Product</h2>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div>
                <label htmlFor="supplierId" className="field-label">
                  Supplier
                </label>
                <select
                  id="supplierId"
                  name="supplierId"
                  defaultValue={item?.supplierId ?? defaultSupplierId ?? ""}
                  aria-invalid={state.field === "supplierId" ? true : undefined}
                  className={state.field === "supplierId" ? "input input-error" : "input"}
                >
                  <option value="">Choose a supplier…</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                      {supplier.status === "approved" ? "" : " (not approved yet)"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="productType" className="field-label">
                  Product type
                </label>
                <input
                  id="productType"
                  name="productType"
                  defaultValue={item?.productType ?? ""}
                  placeholder="T-shirt, 180 gsm"
                  aria-invalid={state.field === "productType" ? true : undefined}
                  className={state.field === "productType" ? "input input-error" : "input"}
                />
              </div>
              <div>
                <label htmlFor="name" className="field-label">
                  Name
                </label>
                <input
                  id="name"
                  name="name"
                  defaultValue={item?.name ?? ""}
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
                  <select
                    id="availability"
                    name="availability"
                    defaultValue={item?.availability ?? "available"}
                    className="input"
                  >
                    <option value="available">Available</option>
                    <option value="limited">Limited</option>
                    <option value="discontinued">Discontinued</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="status" className="field-label">
                    Catalog status
                  </label>
                  <select id="status" name="status" defaultValue={item?.status ?? "active"} className="input">
                    <option value="active">Active — stores can import</option>
                    <option value="retired">Retired — hidden from sourcing</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="category" className="field-label">
                    Category
                  </label>
                  <select id="category" name="category" defaultValue={item?.category ?? "apparel"} className="input">
                    <option value="apparel">Apparel</option>
                    <option value="drinkware">Drinkware</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="currency" className="field-label">
                    Currency
                  </label>
                  {creating ? (
                    <select
                      id="currency"
                      name="currency"
                      value={currency}
                      onChange={(event) => setCurrency(event.target.value)}
                      className="input"
                    >
                      {CURRENCY_OPTIONS.map((option) => (
                        <option key={option.code} value={option.code}>
                          {option.code} — {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="input flex items-center bg-canvas text-muted">{currency}</p>
                  )}
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
                  defaultValue={item?.description ?? ""}
                  required
                  aria-invalid={state.field === "description" ? true : undefined}
                  className={state.field === "description" ? "input input-error" : "input"}
                />
              </div>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="text-base font-semibold text-ink">Costs ({currency})</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="baseCost" className="field-label">
                  Base cost
                </label>
                <input
                  id="baseCost"
                  name="baseCost"
                  inputMode="decimal"
                  defaultValue={item ? toMajorString(item.baseCost, item.currency) : ""}
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
                  defaultValue={item ? toMajorString(item.customizationCostPerArea, item.currency) : ""}
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
                  defaultValue={item ? toMajorString(item.shippingEstimate, item.currency) : ""}
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
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="text-xs font-semibold uppercase tracking-wide text-muted">
                  <tr>
                    <th scope="col" className="py-2 pr-3">Area</th>
                    <th scope="col" className="py-2 pr-3">View</th>
                    <th scope="col" className="py-2 pr-3">Width (mm)</th>
                    <th scope="col" className="py-2 pr-3">Height (mm)</th>
                    <th scope="col" className="py-2 pr-3">Minimum DPI</th>
                    <th scope="col" className="py-2 pr-3">
                      <span className="sr-only">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {areas.map((area, index) => (
                    <tr key={area.key}>
                      <td className="py-2 pr-3">
                        <label htmlFor={`area_name_${area.key}`} className="sr-only">
                          Name for print area {index + 1}
                        </label>
                        <input
                          id={`area_name_${area.key}`}
                          value={area.name}
                          onChange={(event) => updateArea(area.key, { name: event.target.value })}
                          placeholder="Front chest"
                          className="input mt-0 w-36 py-1 text-sm"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <label htmlFor={`area_view_${area.key}`} className="sr-only">
                          View for print area {index + 1}
                        </label>
                        <select
                          id={`area_view_${area.key}`}
                          value={area.view}
                          onChange={(event) =>
                            updateArea(area.key, { view: event.target.value as MockupView })
                          }
                          className="input mt-0 w-32 py-1 text-sm"
                        >
                          {(Object.keys(VIEW_LABELS) as MockupView[]).map((view) => (
                            <option key={view} value={view}>
                              {VIEW_LABELS[view]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pr-3">
                        <label htmlFor={`area_width_${area.key}`} className="sr-only">
                          Width for print area {index + 1}
                        </label>
                        <input
                          id={`area_width_${area.key}`}
                          type="number"
                          min={10}
                          value={area.widthMm}
                          onChange={(event) => updateArea(area.key, { widthMm: event.target.value })}
                          className="input mt-0 w-24 py-1 text-sm"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <label htmlFor={`area_height_${area.key}`} className="sr-only">
                          Height for print area {index + 1}
                        </label>
                        <input
                          id={`area_height_${area.key}`}
                          type="number"
                          min={10}
                          value={area.heightMm}
                          onChange={(event) => updateArea(area.key, { heightMm: event.target.value })}
                          className="input mt-0 w-24 py-1 text-sm"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <label htmlFor={`area_dpi_${area.key}`} className="sr-only">
                          Minimum DPI for print area {index + 1}
                        </label>
                        <input
                          id={`area_dpi_${area.key}`}
                          type="number"
                          min={72}
                          value={area.minDpi}
                          onChange={(event) => updateArea(area.key, { minDpi: event.target.value })}
                          className="input mt-0 w-24 py-1 text-sm"
                        />
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          onClick={() => setAreas((rows) => rows.filter((row) => row.key !== area.key))}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                  {areas.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-3 text-sm text-muted">
                        No print areas yet. A product needs at least one.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="mt-3">
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() =>
                  setAreas((rows) => [
                    ...rows,
                    {
                      key: nextKey("pa"),
                      id: "",
                      name: "",
                      view: "front",
                      widthMm: "200",
                      heightMm: "250",
                      minDpi: "150",
                    },
                  ])
                }
              >
                Add print area
              </button>
            </div>
            {state.field === "printAreas" ? (
              <p className="field-hint text-rose-600">{state.message}</p>
            ) : null}
          </section>

          <section className="card p-5">
            <h2 className="text-base font-semibold text-ink">Variants and availability</h2>
            <p className="mt-1 text-sm text-muted">
              Every variant needs its own SKU. Option values are what shoppers pick from on the storefront.
            </p>
            <div className="mt-4 relative overflow-x-auto">
              <table className="w-full min-w-[44rem] text-left text-sm">
                <thead className="text-xs font-semibold uppercase tracking-wide text-muted">
                  <tr>
                    <th scope="col" className="py-2 pr-3">Colour</th>
                    <th scope="col" className="py-2 pr-3">Swatch</th>
                    <th scope="col" className="py-2 pr-3">Size</th>
                    <th scope="col" className="py-2 pr-3">SKU</th>
                    <th scope="col" className="py-2 pr-3">Base cost</th>
                    <th scope="col" className="py-2 pr-3">Stock</th>
                    <th scope="col" className="py-2 pr-3">
                      <span className="sr-only">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {variants.map((variant, index) => (
                    <tr key={variant.key}>
                      <td className="py-2 pr-3">
                        <label htmlFor={`variant_colour_${variant.key}`} className="sr-only">
                          Colour for variant {index + 1}
                        </label>
                        <input
                          id={`variant_colour_${variant.key}`}
                          value={variant.colour}
                          onChange={(event) => updateVariant(variant.key, { colour: event.target.value })}
                          placeholder="White"
                          className="input mt-0 w-28 py-1 text-sm"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <label htmlFor={`variant_hex_${variant.key}`} className="sr-only">
                          Swatch colour for variant {index + 1}
                        </label>
                        <input
                          id={`variant_hex_${variant.key}`}
                          type="color"
                          value={variant.colourHex}
                          onChange={(event) => updateVariant(variant.key, { colourHex: event.target.value })}
                          className="h-8 w-10 cursor-pointer rounded border border-line bg-surface"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <label htmlFor={`variant_size_${variant.key}`} className="sr-only">
                          Size for variant {index + 1}
                        </label>
                        <input
                          id={`variant_size_${variant.key}`}
                          value={variant.size}
                          onChange={(event) => updateVariant(variant.key, { size: event.target.value })}
                          placeholder="M"
                          className="input mt-0 w-20 py-1 text-sm"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <label htmlFor={`variant_sku_${variant.key}`} className="sr-only">
                          SKU for variant {index + 1}
                        </label>
                        <input
                          id={`variant_sku_${variant.key}`}
                          value={variant.sku}
                          onChange={(event) => updateVariant(variant.key, { sku: event.target.value })}
                          placeholder="TEE-WHT-M"
                          className="input mt-0 w-36 py-1 font-mono text-xs"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <label htmlFor={`variant_cost_${variant.key}`} className="sr-only">
                          Base cost for variant {index + 1}
                        </label>
                        <input
                          id={`variant_cost_${variant.key}`}
                          inputMode="decimal"
                          value={variant.baseCost}
                          onChange={(event) => updateVariant(variant.key, { baseCost: event.target.value })}
                          className="input mt-0 w-24 py-1 text-sm"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <label htmlFor={`variant_stock_${variant.key}`} className="sr-only">
                          Stock for variant {index + 1}
                        </label>
                        <select
                          id={`variant_stock_${variant.key}`}
                          value={variant.availability}
                          onChange={(event) =>
                            updateVariant(variant.key, {
                              availability: event.target.value as VariantRow["availability"],
                            })
                          }
                          className="input mt-0 w-32 py-1 text-sm"
                        >
                          <option value="in_stock">In stock</option>
                          <option value="low_stock">Low stock</option>
                          <option value="out_of_stock">Out of stock</option>
                        </select>
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          onClick={() => setVariants((rows) => rows.filter((row) => row.key !== variant.key))}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                  {variants.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-3 text-sm text-muted">
                        No variants yet. A product needs at least one.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="mt-3">
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() =>
                  setVariants((rows) => [
                    ...rows,
                    {
                      key: nextKey("vr"),
                      id: "",
                      colour: rows[rows.length - 1]?.colour ?? "White",
                      colourHex: rows[rows.length - 1]?.colourHex ?? "#ffffff",
                      size: "",
                      sku: "",
                      baseCost: rows[rows.length - 1]?.baseCost ?? "",
                      availability: "in_stock",
                    },
                  ])
                }
              >
                Add variant
              </button>
            </div>
            {state.field === "variants" ? (
              <p className="field-hint text-rose-600">{state.message}</p>
            ) : null}
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
                      defaultChecked={item ? item.fulfillmentRegions.includes(region) : false}
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

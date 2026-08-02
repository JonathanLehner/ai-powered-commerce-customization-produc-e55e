"use client";

import { saveProductDetails, saveVariants } from "@/app/actions/products";
import { ActionForm } from "@/components/forms";
import type { StoreProduct, TaxBracket } from "@/lib/types";
import { formatMoney, toMajorString } from "@/lib/util";

export function ProductDetailsForm({
  product,
  brackets,
}: {
  product: StoreProduct;
  brackets: TaxBracket[];
}) {
  return (
    <ActionForm
      action={saveProductDetails}
      submitLabel="Save product details"
      hidden={{ storeId: product.storeId, productId: product.id }}
      className="card p-5"
    >
      {(state) => (
        <>
          <h2 className="text-base font-semibold text-ink">Product details</h2>
          <p className="mt-1 text-sm text-muted">
            These values belong to this store only. The same supplier product can be named and priced
            differently in another client&rsquo;s catalog.
          </p>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div>
              <label htmlFor="name" className="field-label">
                Product name
              </label>
              <input
                id="name"
                name="name"
                defaultValue={product.name}
                required
                minLength={3}
                aria-invalid={state.field === "name" ? true : undefined}
                className={state.field === "name" ? "input input-error" : "input"}
              />
            </div>

            <div>
              <label htmlFor="price" className="field-label">
                Selling price ({product.currency})
              </label>
              <input
                id="price"
                name="price"
                inputMode="decimal"
                defaultValue={toMajorString(product.price, product.currency)}
                required
                aria-invalid={state.field === "price" ? true : undefined}
                aria-describedby="price-hint"
                className={state.field === "price" ? "input input-error" : "input"}
              />
              <p id="price-hint" className="field-hint">
                Landed cost is{" "}
                {formatMoney(
                  product.costs.supplierCost + product.costs.customizationCost + product.costs.shippingEstimate,
                  product.currency,
                )}{" "}
                per unit.
              </p>
            </div>

            <div className="lg:col-span-2">
              <label htmlFor="description" className="field-label">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                rows={6}
                defaultValue={product.description}
                required
                minLength={20}
                aria-invalid={state.field === "description" ? true : undefined}
                aria-describedby="description-hint"
                className={state.field === "description" ? "input input-error" : "input"}
              />
              <p id="description-hint" className="field-hint">
                Shown on the storefront product page. Blank lines start a new paragraph.
              </p>
            </div>

            <div>
              <label htmlFor="tags" className="field-label">
                Tags
              </label>
              <input
                id="tags"
                name="tags"
                defaultValue={product.tags.join(", ")}
                aria-describedby="tags-hint"
                className="input"
              />
              <p id="tags-hint" className="field-hint">
                Comma separated. Used for storefront search and merchandising.
              </p>
            </div>

            <div>
              <label htmlFor="taxBracketId" className="field-label">
                Tax bracket
              </label>
              <select
                id="taxBracketId"
                name="taxBracketId"
                defaultValue={product.taxBracketId ?? ""}
                className="input"
              >
                <option value="">No bracket selected</option>
                {brackets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} — {b.rate}%
                  </option>
                ))}
              </select>
              <p className="field-hint">Rates are set globally by the platform administrator.</p>
            </div>

            <fieldset className="lg:col-span-2">
              <legend className="field-label">Storefront visibility</legend>
              <div className="mt-2 flex flex-wrap gap-2.5">
                {[
                  { value: "public", label: "Visible", hint: "Listed and searchable on the storefront." },
                  { value: "hidden", label: "Hidden", hint: "Reachable by direct link only." },
                ].map((option) => (
                  <label
                    key={option.value}
                    className="flex flex-1 cursor-pointer items-start gap-3 rounded-xl border border-line p-3.5 hover:border-brand-300 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50/50"
                  >
                    <input
                      type="radio"
                      name="visibility"
                      value={option.value}
                      defaultChecked={product.visibility === option.value}
                      className="mt-1 h-4 w-4 accent-brand-600"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-ink">{option.label}</span>
                      <span className="mt-0.5 block text-xs text-muted">{option.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="lg:col-span-2 rounded-xl border border-line p-4">
              <legend className="px-1 text-sm font-semibold text-ink">Shopper customisation</legend>
              <p className="text-sm text-muted">
                What a shopper may change on this product before adding it to the cart.
              </p>
              <div className="mt-3 space-y-3">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    name="shopperArtwork"
                    defaultChecked={product.shopperCustomization.artworkUpload}
                    className="mt-0.5 h-4 w-4 accent-brand-600"
                  />
                  <span>
                    <span className="block text-sm font-medium text-ink">Allow artwork upload</span>
                    <span className="text-xs text-muted">
                      The shopper&rsquo;s image is pre-flighted against the same print area rules and rendered
                      into a preview before checkout.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    name="shopperText"
                    defaultChecked={product.shopperCustomization.textLine}
                    className="mt-0.5 h-4 w-4 accent-brand-600"
                  />
                  <span>
                    <span className="block text-sm font-medium text-ink">Allow a personalisation line</span>
                    <span className="text-xs text-muted">A short piece of text printed with the design.</span>
                  </span>
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="textLabel" className="field-label text-xs">
                      Field label
                    </label>
                    <input
                      id="textLabel"
                      name="textLabel"
                      defaultValue={product.shopperCustomization.textLabel}
                      className="input py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="maxTextLength" className="field-label text-xs">
                      Maximum characters
                    </label>
                    <input
                      id="maxTextLength"
                      name="maxTextLength"
                      type="number"
                      min={4}
                      max={40}
                      defaultValue={product.shopperCustomization.maxTextLength}
                      className="input py-1.5 text-sm"
                    />
                  </div>
                </div>
              </div>
            </fieldset>
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function VariantsForm({ product }: { product: StoreProduct }) {
  return (
    <ActionForm
      action={saveVariants}
      submitLabel="Save variants"
      hidden={{ storeId: product.storeId, productId: product.id }}
      className="card p-5"
    >
      {(state) => (
        <>
          <h2 className="text-base font-semibold text-ink">Variants</h2>
          <p className="mt-1 text-sm text-muted">
            Disable the sizes or colours this client does not want to offer. Variant prices override the base
            selling price.
          </p>
          <div className="mt-4 relative overflow-x-auto">
            <table className="w-full min-w-[38rem] text-left text-sm">
              <thead className="text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="py-2 pr-3">Enabled</th>
                  <th scope="col" className="py-2 pr-3">Variant</th>
                  <th scope="col" className="py-2 pr-3">SKU</th>
                  <th scope="col" className="py-2 pr-3">Supplier cost</th>
                  <th scope="col" className="py-2 pr-3">Availability</th>
                  <th scope="col" className="py-2 pr-3">Price ({product.currency})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {product.variants.map((variant) => (
                  <tr key={variant.id}>
                    <td className="py-2 pr-3">
                      <label htmlFor={`enabled_${variant.id}`} className="sr-only">
                        Enable {variant.name}
                      </label>
                      <input
                        id={`enabled_${variant.id}`}
                        type="checkbox"
                        name={`enabled_${variant.id}`}
                        defaultChecked={variant.enabled}
                        className="h-4 w-4 accent-brand-600"
                      />
                    </td>
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
                    <td className="py-2 pr-3 tabular-nums text-inksoft">
                      {formatMoney(variant.baseCost, product.currency)}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={
                          variant.availability === "in_stock"
                            ? "text-xs text-emerald-700"
                            : variant.availability === "low_stock"
                              ? "text-xs text-amber-700"
                              : "text-xs text-rose-700"
                        }
                      >
                        {variant.availability.replace("_", " ")}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <label htmlFor={`price_${variant.id}`} className="sr-only">
                        Price for {variant.name}
                      </label>
                      <input
                        id={`price_${variant.id}`}
                        name={`price_${variant.id}`}
                        inputMode="decimal"
                        defaultValue={toMajorString(variant.price, product.currency)}
                        aria-invalid={state.field === `price_${variant.id}` ? true : undefined}
                        className={
                          state.field === `price_${variant.id}`
                            ? "input input-error mt-0 w-28 py-1 text-sm"
                            : "input mt-0 w-28 py-1 text-sm"
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </ActionForm>
  );
}

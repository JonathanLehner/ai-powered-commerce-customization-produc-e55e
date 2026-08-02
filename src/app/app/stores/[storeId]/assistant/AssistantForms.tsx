"use client";

import { requestCopy, requestPrice, requestProductIdeas, requestSupplier } from "@/app/actions/ai";
import { ActionForm } from "@/components/forms";
import { REGION_OPTIONS } from "@/lib/util";

export function IdeaForm({ storeId, storeName }: { storeId: string; storeName: string }) {
  return (
    <ActionForm
      action={requestProductIdeas}
      submitLabel="Draft product ideas"
      pendingLabel="Asking Gemini…"
      submitClassName="btn-iris"
      hidden={{ storeId }}
      className="card p-5"
    >
      <h2 className="text-base font-semibold text-ink">Product ideas</h2>
      <p className="mt-1 text-sm text-muted">
        Gemini proposes three products for {storeName}, each mapped to a real product in the approved supplier
        catalog. Nothing is created until you apply a suggestion.
      </p>
      <div className="mt-4">
        <label htmlFor="brief" className="field-label">
          Brief (optional)
        </label>
        <textarea
          id="brief"
          name="brief"
          rows={3}
          placeholder="Winter campaign for the field team; budget under $40 per unit; must ship inside the EU."
          className="input"
        />
        <p className="field-hint">
          Mention the audience, budget or markets. Leave empty for a general range.
        </p>
      </div>
    </ActionForm>
  );
}

export function CopyForm({
  storeId,
  products,
}: {
  storeId: string;
  products: { id: string; name: string }[];
}) {
  return (
    <ActionForm
      action={requestCopy}
      submitLabel="Draft description and tags"
      pendingLabel="Writing…"
      submitClassName="btn-iris"
      hidden={{ storeId }}
      className="card p-5"
    >
      {(state) => (
        <>
          <h2 className="text-base font-semibold text-ink">Description and tags</h2>
          <p className="mt-1 text-sm text-muted">
            Rewrites storefront copy using the product&rsquo;s real category and configured variants.
          </p>
          <div className="mt-4">
            <label htmlFor="copy-product" className="field-label">
              Product
            </label>
            <select
              id="copy-product"
              name="productId"
              required
              aria-invalid={state.field === "productId" ? true : undefined}
              className={state.field === "productId" ? "input input-error" : "input"}
            >
              <option value="">Choose a product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function PriceForm({
  storeId,
  products,
}: {
  storeId: string;
  products: { id: string; name: string }[];
}) {
  return (
    <ActionForm
      action={requestPrice}
      submitLabel="Draft a price"
      pendingLabel="Calculating…"
      submitClassName="btn-iris"
      hidden={{ storeId }}
      className="card p-5"
    >
      {(state) => (
        <>
          <h2 className="text-base font-semibold text-ink">Pricing</h2>
          <p className="mt-1 text-sm text-muted">
            Suggests a retail price against the product&rsquo;s landed cost and explains the reasoning.
          </p>
          <div className="mt-4">
            <label htmlFor="price-product" className="field-label">
              Product
            </label>
            <select
              id="price-product"
              name="productId"
              required
              aria-invalid={state.field === "productId" ? true : undefined}
              className={state.field === "productId" ? "input input-error" : "input"}
            >
              <option value="">Choose a product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function SupplierForm({
  storeId,
  catalog,
}: {
  storeId: string;
  catalog: { id: string; name: string }[];
}) {
  return (
    <ActionForm
      action={requestSupplier}
      submitLabel="Recommend a partner"
      pendingLabel="Comparing suppliers…"
      submitClassName="btn-iris"
      hidden={{ storeId }}
      className="card p-5"
    >
      {(state) => (
        <>
          <h2 className="text-base font-semibold text-ink">Supplier comparison</h2>
          <p className="mt-1 text-sm text-muted">
            Compares approved production partners for a destination, weighing lead time, regions and whether
            they expose an order API.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="supplier-catalog" className="field-label">
                Supplier product
              </label>
              <select
                id="supplier-catalog"
                name="catalogId"
                required
                aria-invalid={state.field === "catalogId" ? true : undefined}
                className={state.field === "catalogId" ? "input input-error" : "input"}
              >
                <option value="">Choose a product…</option>
                {catalog.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="destination" className="field-label">
                Main destination
              </label>
              <select id="destination" name="destination" defaultValue="North America" className="input">
                {REGION_OPTIONS.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </>
      )}
    </ActionForm>
  );
}

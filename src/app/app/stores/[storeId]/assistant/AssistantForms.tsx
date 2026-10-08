"use client";

import { requestCopy, requestPrice, requestProductIdeas, requestSupplier } from "@/app/actions/ai";
import { ActionForm } from "@/components/forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { REGION_OPTIONS } from "@/lib/util";

/** Every panel on this page is the same card with one field in it. */
function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <>
      <CardHeader>
        <CardTitle asChild>
          <h2>{title}</h2>
        </CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </>
  );
}

/** The product picker shared by the copy and pricing panels. */
function ProductPicker({
  id,
  options,
  invalid,
}: {
  id: string;
  options: { id: string; label: string }[];
  invalid: boolean;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>Product</Label>
      <Select name="productId" required>
        <SelectTrigger id={id} className="w-full" aria-invalid={invalid ? true : undefined}>
          <SelectValue placeholder="Choose a product…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function IdeaForm({ storeId, storeName }: { storeId: string; storeName: string }) {
  return (
    <Card asChild>
      <ActionForm
        action={requestProductIdeas}
        submitLabel="Draft product ideas"
        pendingLabel="Drafting…"
        submitVariant="secondary"
        hidden={{ storeId }}
        actionsClassName="px-(--card-spacing)"
      >
        <Panel
          title="Product ideas"
          description={`Three products for ${storeName}, each mapped to a real item in the approved supplier catalog.`}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="brief">Brief (optional)</Label>
            <Textarea
              id="brief"
              name="brief"
              rows={3}
              placeholder="Winter campaign for the field team; budget under $40 per unit; must ship inside the EU."
              aria-describedby="brief-hint"
            />
            <p id="brief-hint" className="text-xs text-muted-foreground">
              Mention the audience, budget or markets. Leave empty for a general range.
            </p>
          </div>
        </Panel>
    </ActionForm>
    </Card>
  );
}

export function CopyForm({
  storeId,
  products,
}: {
  storeId: string;
  /** Labelled with SKU and import date, so two copies of one item are tellable apart. */
  products: { id: string; label: string }[];
}) {
  return (
    <Card asChild>
      <ActionForm
        action={requestCopy}
        submitLabel="Draft description and tags"
        pendingLabel="Writing…"
        submitVariant="secondary"
        hidden={{ storeId }}
        actionsClassName="px-(--card-spacing)"
      >
        {(state) => (
          <Panel
            title="Description and tags"
            description="Rewrites storefront copy using the product’s real category and configured variants."
          >
            <ProductPicker id="copy-product" options={products} invalid={state.field === "productId"} />
          </Panel>
        )}
    </ActionForm>
    </Card>
  );
}

export function PriceForm({
  storeId,
  products,
}: {
  storeId: string;
  /** Labelled with SKU and import date, so two copies of one item are tellable apart. */
  products: { id: string; label: string }[];
}) {
  return (
    <Card asChild>
      <ActionForm
        action={requestPrice}
        submitLabel="Draft a price"
        pendingLabel="Calculating…"
        submitVariant="secondary"
        hidden={{ storeId }}
        actionsClassName="px-(--card-spacing)"
      >
        {(state) => (
          <Panel
            title="Pricing"
            description="Suggests a retail price against the product’s landed cost and explains the reasoning."
          >
            <ProductPicker id="price-product" options={products} invalid={state.field === "productId"} />
          </Panel>
        )}
    </ActionForm>
    </Card>
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
    <Card asChild>
      <ActionForm
        action={requestSupplier}
        submitLabel="Recommend a partner"
        pendingLabel="Comparing suppliers…"
        submitVariant="secondary"
        hidden={{ storeId }}
        actionsClassName="px-(--card-spacing)"
      >
        {(state) => (
          <Panel
            title="Supplier comparison"
            description="Compares approved production partners for a destination, weighing lead time, regions and whether they expose an order API."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid content-start gap-1.5">
                <Label htmlFor="supplier-catalog">Supplier product</Label>
                <Select name="catalogId" required>
                  <SelectTrigger
                    id="supplier-catalog"
                    className="w-full"
                    aria-invalid={state.field === "catalogId" ? true : undefined}
                  >
                    <SelectValue placeholder="Choose a product…" />
                  </SelectTrigger>
                  <SelectContent>
                    {catalog.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid content-start gap-1.5">
                <Label htmlFor="destination">Main destination</Label>
                <Select name="destination" defaultValue="North America">
                  <SelectTrigger id="destination" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REGION_OPTIONS.map((region) => (
                      <SelectItem key={region} value={region}>
                        {region}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Panel>
        )}
    </ActionForm>
    </Card>
  );
}

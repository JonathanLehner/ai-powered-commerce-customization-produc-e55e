"use client";

import { useState } from "react";
import { saveCatalogItem } from "@/app/actions/admin";
import { ActionForm } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
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

/** The column-head style every table in the workspace shares. */
const TH = "px-0 pr-3 text-xs font-semibold tracking-wide uppercase text-muted-foreground";

/** A row cell in the print-area and variant editors. */
const TD = "px-0 py-2 pr-3 align-middle whitespace-normal";

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
          <Card asChild>
          <section>
            <CardHeader>
              <CardTitle asChild>
                <h2>Product</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <div className="grid content-start gap-1.5">
                <Label htmlFor="supplierId">Supplier</Label>
                <Select name="supplierId" defaultValue={item?.supplierId ?? defaultSupplierId ?? undefined}>
                  <SelectTrigger
                    id="supplierId"
                    className="w-full"
                    aria-invalid={state.field === "supplierId" ? true : undefined}
                  >
                    <SelectValue placeholder="Choose a supplier…" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                        {supplier.status === "approved" ? "" : " (not approved yet)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid content-start gap-1.5">
                <Label htmlFor="productType">Product type</Label>
                <Input
                  id="productType"
                  name="productType"
                  defaultValue={item?.productType ?? ""}
                  placeholder="T-shirt, 180 gsm"
                  aria-invalid={state.field === "productType" ? true : undefined}
                />
              </div>
              <div className="grid content-start gap-1.5">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={item?.name ?? ""}
                  required
                  aria-invalid={state.field === "name" ? true : undefined}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid content-start gap-1.5">
                  <Label htmlFor="availability">Availability</Label>
                  <Select name="availability" defaultValue={item?.availability ?? "available"}>
                    <SelectTrigger id="availability" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="available">Available</SelectItem>
                      <SelectItem value="limited">Limited</SelectItem>
                      <SelectItem value="discontinued">Discontinued</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid content-start gap-1.5">
                  <Label htmlFor="status">Catalog status</Label>
                  <Select name="status" defaultValue={item?.status ?? "active"}>
                    <SelectTrigger id="status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active — stores can import</SelectItem>
                      <SelectItem value="retired">Retired — hidden from sourcing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid content-start gap-1.5">
                  <Label htmlFor="category">Category</Label>
                  <Select name="category" defaultValue={item?.category ?? "apparel"}>
                    <SelectTrigger id="category" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="apparel">Apparel</SelectItem>
                      <SelectItem value="drinkware">Drinkware</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid content-start gap-1.5">
                  <Label htmlFor="currency">Currency</Label>
                  {creating ? (
                    <Select name="currency" value={currency} onValueChange={setCurrency}>
                      <SelectTrigger id="currency" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCY_OPTIONS.map((option) => (
                          <SelectItem key={option.code} value={option.code}>
                            {option.code} — {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="flex h-8 items-center rounded-lg border border-input bg-muted px-2.5 text-sm text-muted-foreground">
                      {currency}
                    </p>
                  )}
                </div>
              </div>
              <div className="grid content-start gap-1.5 lg:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  rows={4}
                  defaultValue={item?.description ?? ""}
                  required
                  aria-invalid={state.field === "description" ? true : undefined}
                />
              </div>
            </CardContent>
          </section>
          </Card>

          <Card asChild>
          <section>
            <CardHeader>
              <CardTitle asChild>
                <h2>Costs ({currency})</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div className="grid content-start gap-1.5">
                <Label htmlFor="baseCost">Base cost</Label>
                <Input
                  id="baseCost"
                  name="baseCost"
                  inputMode="decimal"
                  defaultValue={item ? toMajorString(item.baseCost, item.currency) : ""}
                  required
                  aria-invalid={state.field === "baseCost" ? true : undefined}
                />
              </div>
              <div className="grid content-start gap-1.5">
                <Label htmlFor="customizationCost">Customisation per print area</Label>
                <Input
                  id="customizationCost"
                  name="customizationCost"
                  inputMode="decimal"
                  defaultValue={item ? toMajorString(item.customizationCostPerArea, item.currency) : ""}
                  required
                  aria-invalid={state.field === "customizationCost" ? true : undefined}
                />
              </div>
              <div className="grid content-start gap-1.5">
                <Label htmlFor="shippingEstimate">Estimated shipping</Label>
                <Input
                  id="shippingEstimate"
                  name="shippingEstimate"
                  inputMode="decimal"
                  defaultValue={item ? toMajorString(item.shippingEstimate, item.currency) : ""}
                  required
                  aria-invalid={state.field === "shippingEstimate" ? true : undefined}
                />
              </div>
            </CardContent>
          </section>
          </Card>

          <Card asChild>
          <section>
            <CardHeader>
              <CardTitle asChild>
                <h2>Print areas</h2>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Physical size and minimum resolution. Store artwork is pre-flighted against these numbers.
              </p>
            </CardHeader>
            <CardContent>
              <div className="relative overflow-x-auto">
                <Table className="min-w-[40rem]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className={TH}>Area</TableHead>
                      <TableHead className={TH}>View</TableHead>
                      <TableHead className={TH}>Width (mm)</TableHead>
                      <TableHead className={TH}>Height (mm)</TableHead>
                      <TableHead className={TH}>Minimum DPI</TableHead>
                      <TableHead className={TH}>
                        <span className="sr-only">Remove</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {areas.map((area, index) => (
                      <TableRow key={area.key} className="hover:bg-transparent">
                        <TableCell className={TD}>
                          <Label htmlFor={`area_name_${area.key}`} className="sr-only">
                            Name for print area {index + 1}
                          </Label>
                          <Input
                            id={`area_name_${area.key}`}
                            value={area.name}
                            onChange={(event) => updateArea(area.key, { name: event.target.value })}
                            placeholder="Front chest"
                            className="w-36"
                          />
                        </TableCell>
                        <TableCell className={TD}>
                          <Label htmlFor={`area_view_${area.key}`} className="sr-only">
                            View for print area {index + 1}
                          </Label>
                          <Select
                            value={area.view}
                            onValueChange={(value) => updateArea(area.key, { view: value as MockupView })}
                          >
                            <SelectTrigger id={`area_view_${area.key}`} className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(VIEW_LABELS) as MockupView[]).map((view) => (
                                <SelectItem key={view} value={view}>
                                  {VIEW_LABELS[view]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className={TD}>
                          <Label htmlFor={`area_width_${area.key}`} className="sr-only">
                            Width for print area {index + 1}
                          </Label>
                          <Input
                            id={`area_width_${area.key}`}
                            type="number"
                            min={10}
                            value={area.widthMm}
                            onChange={(event) => updateArea(area.key, { widthMm: event.target.value })}
                            className="w-24"
                          />
                        </TableCell>
                        <TableCell className={TD}>
                          <Label htmlFor={`area_height_${area.key}`} className="sr-only">
                            Height for print area {index + 1}
                          </Label>
                          <Input
                            id={`area_height_${area.key}`}
                            type="number"
                            min={10}
                            value={area.heightMm}
                            onChange={(event) => updateArea(area.key, { heightMm: event.target.value })}
                            className="w-24"
                          />
                        </TableCell>
                        <TableCell className={TD}>
                          <Label htmlFor={`area_dpi_${area.key}`} className="sr-only">
                            Minimum DPI for print area {index + 1}
                          </Label>
                          <Input
                            id={`area_dpi_${area.key}`}
                            type="number"
                            min={72}
                            value={area.minDpi}
                            onChange={(event) => updateArea(area.key, { minDpi: event.target.value })}
                            className="w-24"
                          />
                        </TableCell>
                        <TableCell className={`${TD} text-right`}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setAreas((rows) => rows.filter((row) => row.key !== area.key))}
                          >
                            Remove
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {areas.length === 0 ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={6} className="px-0 py-3 text-sm text-muted-foreground">
                          No print areas yet. A product needs at least one.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
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
                </Button>
              </div>
              {state.field === "printAreas" ? (
                <p className="mt-1.5 text-xs text-destructive">{state.message}</p>
              ) : null}
            </CardContent>
          </section>
          </Card>

          <Card asChild>
          <section>
            <CardHeader>
              <CardTitle asChild>
                <h2>Variants and availability</h2>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Every variant needs its own SKU. Option values are what shoppers pick from on the storefront.
              </p>
            </CardHeader>
            <CardContent>
              <div className="relative overflow-x-auto">
                <Table className="min-w-[44rem]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className={TH}>Colour</TableHead>
                      <TableHead className={TH}>Swatch</TableHead>
                      <TableHead className={TH}>Size</TableHead>
                      <TableHead className={TH}>SKU</TableHead>
                      <TableHead className={TH}>Base cost</TableHead>
                      <TableHead className={TH}>Stock</TableHead>
                      <TableHead className={TH}>
                        <span className="sr-only">Remove</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {variants.map((variant, index) => (
                      <TableRow key={variant.key} className="hover:bg-transparent">
                        <TableCell className={TD}>
                          <Label htmlFor={`variant_colour_${variant.key}`} className="sr-only">
                            Colour for variant {index + 1}
                          </Label>
                          <Input
                            id={`variant_colour_${variant.key}`}
                            value={variant.colour}
                            onChange={(event) => updateVariant(variant.key, { colour: event.target.value })}
                            placeholder="White"
                            className="w-28"
                          />
                        </TableCell>
                        <TableCell className={TD}>
                          <Label htmlFor={`variant_hex_${variant.key}`} className="sr-only">
                            Swatch colour for variant {index + 1}
                          </Label>
                          <Input
                            id={`variant_hex_${variant.key}`}
                            type="color"
                            value={variant.colourHex}
                            onChange={(event) => updateVariant(variant.key, { colourHex: event.target.value })}
                            className="w-10 cursor-pointer p-1"
                          />
                        </TableCell>
                        <TableCell className={TD}>
                          <Label htmlFor={`variant_size_${variant.key}`} className="sr-only">
                            Size for variant {index + 1}
                          </Label>
                          <Input
                            id={`variant_size_${variant.key}`}
                            value={variant.size}
                            onChange={(event) => updateVariant(variant.key, { size: event.target.value })}
                            placeholder="M"
                            className="w-20"
                          />
                        </TableCell>
                        <TableCell className={TD}>
                          <Label htmlFor={`variant_sku_${variant.key}`} className="sr-only">
                            SKU for variant {index + 1}
                          </Label>
                          <Input
                            id={`variant_sku_${variant.key}`}
                            value={variant.sku}
                            onChange={(event) => updateVariant(variant.key, { sku: event.target.value })}
                            placeholder="TEE-WHT-M"
                            className="w-36 font-mono text-xs"
                          />
                        </TableCell>
                        <TableCell className={TD}>
                          <Label htmlFor={`variant_cost_${variant.key}`} className="sr-only">
                            Base cost for variant {index + 1}
                          </Label>
                          <Input
                            id={`variant_cost_${variant.key}`}
                            inputMode="decimal"
                            value={variant.baseCost}
                            onChange={(event) => updateVariant(variant.key, { baseCost: event.target.value })}
                            className="w-24"
                          />
                        </TableCell>
                        <TableCell className={TD}>
                          <Label htmlFor={`variant_stock_${variant.key}`} className="sr-only">
                            Stock for variant {index + 1}
                          </Label>
                          <Select
                            value={variant.availability}
                            onValueChange={(value) =>
                              updateVariant(variant.key, {
                                availability: value as VariantRow["availability"],
                              })
                            }
                          >
                            <SelectTrigger id={`variant_stock_${variant.key}`} className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="in_stock">In stock</SelectItem>
                              <SelectItem value="low_stock">Low stock</SelectItem>
                              <SelectItem value="out_of_stock">Out of stock</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className={`${TD} text-right`}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setVariants((rows) => rows.filter((row) => row.key !== variant.key))}
                          >
                            Remove
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {variants.length === 0 ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={7} className="px-0 py-3 text-sm text-muted-foreground">
                          No variants yet. A product needs at least one.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
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
                </Button>
              </div>
              {state.field === "variants" ? (
                <p className="mt-1.5 text-xs text-destructive">{state.message}</p>
              ) : null}
            </CardContent>
          </section>
          </Card>

          <Card asChild>
          <section>
            <CardContent>
              <fieldset>
                <legend className="font-heading text-base leading-snug font-medium text-foreground">
                  Fulfilment regions
                </legend>
                <p className="mt-1 text-sm text-muted-foreground">
                  Orders shipping outside these regions are flagged for manual routing instead of being
                  submitted.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {REGION_OPTIONS.map((region) => (
                    <Label
                      key={region}
                      className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm font-normal hover:bg-muted has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                    >
                      <Checkbox
                        name="regions"
                        value={region}
                        defaultChecked={item ? item.fulfillmentRegions.includes(region) : false}
                      />
                      {region}
                    </Label>
                  ))}
                </div>
                {state.field === "regions" ? (
                  <p className="mt-1.5 text-xs text-destructive">Choose at least one region.</p>
                ) : null}
              </fieldset>
            </CardContent>
          </section>
          </Card>
        </>
      )}
    </ActionForm>
  );
}

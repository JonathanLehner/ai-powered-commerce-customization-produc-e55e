"use client";

import { useLocale, useTranslations } from "next-intl";
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
import { currencyName } from "@/i18n/display";
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
  const t = useTranslations("admin.catalogForm");
  const labels = useTranslations("labels");
  const locale = useLocale();
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
      submitLabel={creating ? t("create") : t("save")}
      pendingLabel={creating ? t("creating") : t("saving")}
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
                <h2>{t("product")}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <div className="grid content-start gap-1.5">
                <Label htmlFor="supplierId">{t("supplier")}</Label>
                <Select name="supplierId" defaultValue={item?.supplierId ?? defaultSupplierId ?? undefined}>
                  <SelectTrigger
                    id="supplierId"
                    className="w-full"
                    aria-invalid={state.field === "supplierId" ? true : undefined}
                  >
                    <SelectValue placeholder={t("chooseSupplier")} />
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
                <Label htmlFor="productType">{t("productType")}</Label>
                <Input
                  id="productType"
                  name="productType"
                  defaultValue={item?.productType ?? ""}
                  placeholder={t("productTypePlaceholder")}
                  aria-invalid={state.field === "productType" ? true : undefined}
                />
              </div>
              <div className="grid content-start gap-1.5">
                <Label htmlFor="name">{t("name")}</Label>
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
                  <Label htmlFor="availability">{t("availability")}</Label>
                  <Select name="availability" defaultValue={item?.availability ?? "available"}>
                    <SelectTrigger id="availability" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="available">{labels("catalogAvailability.available")}</SelectItem>
                      <SelectItem value="limited">{labels("catalogAvailability.limited")}</SelectItem>
                      <SelectItem value="discontinued">{labels("catalogAvailability.discontinued")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid content-start gap-1.5">
                  <Label htmlFor="status">{t("catalogStatus")}</Label>
                  <Select name="status" defaultValue={item?.status ?? "active"}>
                    <SelectTrigger id="status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">{labels("catalogStatus.active")}</SelectItem>
                      <SelectItem value="retired">{labels("catalogStatus.retired")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid content-start gap-1.5">
                  <Label htmlFor="category">{t("category")}</Label>
                  <Select name="category" defaultValue={item?.category ?? "apparel"}>
                    <SelectTrigger id="category" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="apparel">{t("apparel")}</SelectItem>
                      <SelectItem value="drinkware">{t("drinkware")}</SelectItem>
                      <SelectItem value="accessories">{t("accessories")}</SelectItem>
                      <SelectItem value="prints">{t("prints")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid content-start gap-1.5">
                  <Label htmlFor="currency">{t("currency")}</Label>
                  {creating ? (
                    <Select name="currency" value={currency} onValueChange={setCurrency}>
                      <SelectTrigger id="currency" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCY_OPTIONS.map((option) => (
                          <SelectItem key={option.code} value={option.code}>
                            {option.code} · {currencyName(locale, option.code, option.label)}
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
                <Label htmlFor="description">{t("description")}</Label>
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
                <h2>{t("costs", { currency })}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div className="grid content-start gap-1.5">
                <Label htmlFor="baseCost">{t("baseCost")}</Label>
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
                <Label htmlFor="customizationCost">{t("customisation")}</Label>
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
                <Label htmlFor="shippingEstimate">{t("shipping")}</Label>
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
                <h2>{t("printAreas")}</h2>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {t("printAreasBody")}
              </p>
            </CardHeader>
            <CardContent>
              <div className="relative overflow-x-auto">
                <Table className="min-w-[40rem]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className={TH}>{t("colArea")}</TableHead>
                      <TableHead className={TH}>{t("colView")}</TableHead>
                      <TableHead className={TH}>{t("colWidth")}</TableHead>
                      <TableHead className={TH}>{t("colHeight")}</TableHead>
                      <TableHead className={TH}>{t("colDpi")}</TableHead>
                      <TableHead className={TH}>
                        <span className="sr-only">{t("remove")}</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {areas.map((area, index) => (
                      <TableRow key={area.key} className="hover:bg-transparent">
                        <TableCell className={TD}>
                          <Label htmlFor={`area_name_${area.key}`} className="sr-only">
                            {t("areaName", { index: index + 1 })}
                          </Label>
                          <Input
                            id={`area_name_${area.key}`}
                            value={area.name}
                            onChange={(event) => updateArea(area.key, { name: event.target.value })}
                            placeholder={t("areaNamePlaceholder")}
                            className="w-36"
                          />
                        </TableCell>
                        <TableCell className={TD}>
                          <Label htmlFor={`area_view_${area.key}`} className="sr-only">
                            {t("areaView", { index: index + 1 })}
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
                                  {labels(`view.${view}`)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className={TD}>
                          <Label htmlFor={`area_width_${area.key}`} className="sr-only">
                            {t("areaWidth", { index: index + 1 })}
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
                            {t("areaHeight", { index: index + 1 })}
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
                            {t("areaDpi", { index: index + 1 })}
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
                            {t("remove")}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {areas.length === 0 ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={6} className="px-0 py-3 text-sm text-muted-foreground">
                          {t("noAreas")}
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
                  {t("addArea")}
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
                <h2>{t("variants")}</h2>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {t("variantsBody")}
              </p>
            </CardHeader>
            <CardContent>
              <div className="relative overflow-x-auto">
                <Table className="min-w-[44rem]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className={TH}>{t("colColour")}</TableHead>
                      <TableHead className={TH}>{t("colSwatch")}</TableHead>
                      <TableHead className={TH}>{t("colSize")}</TableHead>
                      <TableHead className={TH}>{t("colSku")}</TableHead>
                      <TableHead className={TH}>{t("colCost")}</TableHead>
                      <TableHead className={TH}>{t("colStock")}</TableHead>
                      <TableHead className={TH}>
                        <span className="sr-only">{t("remove")}</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {variants.map((variant, index) => (
                      <TableRow key={variant.key} className="hover:bg-transparent">
                        <TableCell className={TD}>
                          <Label htmlFor={`variant_colour_${variant.key}`} className="sr-only">
                            {t("variantColour", { index: index + 1 })}
                          </Label>
                          <Input
                            id={`variant_colour_${variant.key}`}
                            value={variant.colour}
                            onChange={(event) => updateVariant(variant.key, { colour: event.target.value })}
                            placeholder={t("colourPlaceholder")}
                            className="w-28"
                          />
                        </TableCell>
                        <TableCell className={TD}>
                          <Label htmlFor={`variant_hex_${variant.key}`} className="sr-only">
                            {t("variantSwatch", { index: index + 1 })}
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
                            {t("variantSize", { index: index + 1 })}
                          </Label>
                          <Input
                            id={`variant_size_${variant.key}`}
                            value={variant.size}
                            onChange={(event) => updateVariant(variant.key, { size: event.target.value })}
                            placeholder={t("sizePlaceholder")}
                            className="w-20"
                          />
                        </TableCell>
                        <TableCell className={TD}>
                          <Label htmlFor={`variant_sku_${variant.key}`} className="sr-only">
                            {t("variantSku", { index: index + 1 })}
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
                            {t("variantCost", { index: index + 1 })}
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
                            {t("variantStock", { index: index + 1 })}
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
                              <SelectItem value="in_stock">{labels("availability.in_stock")}</SelectItem>
                              <SelectItem value="low_stock">{labels("availability.low_stock")}</SelectItem>
                              <SelectItem value="out_of_stock">{labels("availability.out_of_stock")}</SelectItem>
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
                            {t("remove")}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {variants.length === 0 ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={7} className="px-0 py-3 text-sm text-muted-foreground">
                          {t("noVariants")}
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
                  {t("addVariant")}
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
                  {t("regions")}
                </legend>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("regionsBody")}
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
                      {labels(`region.${region}` as "region.APAC")}
                    </Label>
                  ))}
                </div>
                {state.field === "regions" ? (
                  <p className="mt-1.5 text-xs text-destructive">{t("regionRequired")}</p>
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

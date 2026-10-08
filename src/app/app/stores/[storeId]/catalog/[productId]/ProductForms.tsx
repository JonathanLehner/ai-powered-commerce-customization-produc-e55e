"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { deleteProduct, saveProductDetails, saveVariants } from "@/app/actions/products";
import { ActionForm } from "@/components/forms";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { StoreProduct, TaxBracket } from "@/lib/types";
import { formatMoney, toMajorString } from "@/lib/util";

/**
 * The value the tax dropdown carries for "no bracket selected". Radix refuses
 * an empty option value, so the choice is posted through a hidden field that
 * turns the sentinel back into the empty string the action already expects.
 */
const NO_BRACKET = "none";

const TH = "px-0 text-xs font-semibold tracking-wide uppercase text-muted-foreground";

export function ProductDetailsForm({
  product,
  brackets,
}: {
  product: StoreProduct;
  brackets: TaxBracket[];
}) {
  const [bracket, setBracket] = useState(product.taxBracketId ?? NO_BRACKET);

  return (
    <Card asChild>
      <ActionForm
        action={saveProductDetails}
        submitLabel="Save product details"
        hidden={{ storeId: product.storeId, productId: product.id }}
        actionsClassName="px-(--card-spacing)"
      >
        {(state) => (
          <>
            <CardHeader>
              <CardTitle asChild>
                <h2>Product details</h2>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                These values belong to this store only. The same supplier product can be named and priced
                differently in another client&rsquo;s catalog.
              </p>
            </CardHeader>

            <CardContent className="grid gap-5 lg:grid-cols-2">
              <div className="grid content-start gap-1.5">
                <Label htmlFor="name">Product name</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={product.name}
                  required
                  minLength={3}
                  aria-invalid={state.field === "name" ? true : undefined}
                />
              </div>

              <div className="grid content-start gap-1.5">
                <Label htmlFor="price">Selling price ({product.currency})</Label>
                <Input
                  id="price"
                  name="price"
                  inputMode="decimal"
                  defaultValue={toMajorString(product.price, product.currency)}
                  required
                  aria-invalid={state.field === "price" ? true : undefined}
                  aria-describedby="price-hint"
                />
                <p id="price-hint" className="text-xs text-muted-foreground">
                  Landed cost is{" "}
                  <span className="tabular-nums">
                    {formatMoney(
                      product.costs.supplierCost +
                        product.costs.customizationCost +
                        product.costs.shippingEstimate,
                      product.currency,
                    )}
                  </span>{" "}
                  per unit.
                </p>
              </div>

              <div className="grid gap-1.5 lg:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  rows={6}
                  defaultValue={product.description}
                  required
                  minLength={20}
                  aria-invalid={state.field === "description" ? true : undefined}
                  aria-describedby="description-hint"
                />
                <p id="description-hint" className="text-xs text-muted-foreground">
                  Shown on the storefront product page. Blank lines start a new paragraph.
                </p>
              </div>

              <div className="grid content-start gap-1.5">
                <Label htmlFor="tags">Tags</Label>
                <Input id="tags" name="tags" defaultValue={product.tags.join(", ")} aria-describedby="tags-hint" />
                <p id="tags-hint" className="text-xs text-muted-foreground">
                  Comma separated. Used for storefront search and merchandising.
                </p>
              </div>

              <div className="grid content-start gap-1.5">
                <Label htmlFor="taxBracketId">Tax bracket</Label>
                <input type="hidden" name="taxBracketId" value={bracket === NO_BRACKET ? "" : bracket} />
                <Select value={bracket} onValueChange={setBracket}>
                  <SelectTrigger id="taxBracketId" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_BRACKET}>No bracket selected</SelectItem>
                    {brackets.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} — {b.rate}%
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Rates are set globally by the platform administrator.
                </p>
              </div>

              <fieldset className="lg:col-span-2">
                <legend className="text-sm leading-none font-medium text-foreground select-none">
                  Storefront visibility
                </legend>
                <div className="mt-2 flex flex-wrap gap-2.5">
                  {[
                    { value: "public", label: "Visible", hint: "Listed and searchable on the storefront." },
                    { value: "hidden", label: "Hidden", hint: "Reachable by direct link only." },
                  ].map((option) => (
                    <Label
                      key={option.value}
                      className="flex flex-1 cursor-pointer items-start gap-3 rounded-xl border border-border p-3.5 font-normal hover:border-primary/40 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                    >
                      <input
                        type="radio"
                        name="visibility"
                        value={option.value}
                        defaultChecked={product.visibility === option.value}
                        className="mt-1 size-4 accent-primary"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-foreground">{option.label}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{option.hint}</span>
                      </span>
                    </Label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="rounded-xl border border-border p-4 lg:col-span-2">
                <legend className="px-1 text-sm font-semibold text-foreground">Shopper customisation</legend>
                <p className="text-sm text-muted-foreground">
                  What a shopper may change on this product before adding it to the cart.
                </p>
                <div className="mt-3 space-y-3">
                  <div className="flex items-start gap-3">
                    <Switch
                      id="shopperArtwork"
                      name="shopperArtwork"
                      defaultChecked={product.shopperCustomization.artworkUpload}
                      className="mt-0.5"
                    />
                    <Label htmlFor="shopperArtwork" className="block cursor-pointer font-normal">
                      <span className="block text-sm font-medium text-foreground">Allow artwork upload</span>
                      <span className="text-xs text-muted-foreground">
                        The shopper&rsquo;s image is pre-flighted against the same print area rules and
                        rendered into a preview before checkout.
                      </span>
                    </Label>
                  </div>
                  <div className="flex items-start gap-3">
                    <Switch
                      id="shopperText"
                      name="shopperText"
                      defaultChecked={product.shopperCustomization.textLine}
                      className="mt-0.5"
                    />
                    <Label htmlFor="shopperText" className="block cursor-pointer font-normal">
                      <span className="block text-sm font-medium text-foreground">
                        Allow a personalisation line
                      </span>
                      <span className="text-xs text-muted-foreground">
                        A short piece of text printed with the design.
                      </span>
                    </Label>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                      <Label htmlFor="textLabel" className="text-xs">
                        Field label
                      </Label>
                      <Input
                        id="textLabel"
                        name="textLabel"
                        defaultValue={product.shopperCustomization.textLabel}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="maxTextLength" className="text-xs">
                        Maximum characters
                      </Label>
                      <Input
                        id="maxTextLength"
                        name="maxTextLength"
                        type="number"
                        min={4}
                        max={40}
                        defaultValue={product.shopperCustomization.maxTextLength}
                        className="tabular-nums"
                      />
                    </div>
                  </div>
                </div>
              </fieldset>
            </CardContent>
          </>
        )}
      </ActionForm>
    </Card>
  );
}

export function VariantsForm({ product }: { product: StoreProduct }) {
  return (
    <Card asChild>
      <ActionForm
        action={saveVariants}
        submitLabel="Save variants"
        hidden={{ storeId: product.storeId, productId: product.id }}
        actionsClassName="px-(--card-spacing)"
      >
        {(state) => (
          <>
            <CardHeader>
              <CardTitle asChild>
                <h2>Variants</h2>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Disable the sizes or colours this client does not want to offer. Variant prices override the
                base selling price.
              </p>
            </CardHeader>
            <CardContent>
              <div className="relative overflow-x-auto">
                <Table className="min-w-[38rem]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className={TH}>Enabled</TableHead>
                      <TableHead className={TH}>Variant</TableHead>
                      <TableHead className={TH}>SKU</TableHead>
                      <TableHead className={TH}>Supplier cost</TableHead>
                      <TableHead className={TH}>Availability</TableHead>
                      <TableHead className={TH}>Price ({product.currency})</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {product.variants.map((variant) => (
                      <TableRow key={variant.id} className="hover:bg-transparent">
                        <TableCell className="px-0 py-2">
                          <Label htmlFor={`enabled_${variant.id}`} className="sr-only">
                            Enable {variant.name}
                          </Label>
                          <Switch
                            id={`enabled_${variant.id}`}
                            name={`enabled_${variant.id}`}
                            defaultChecked={variant.enabled}
                          />
                        </TableCell>
                        <TableCell className="px-0 py-2">
                          <span className="flex items-center gap-2">
                            <span
                              aria-hidden
                              className="h-3.5 w-3.5 rounded-full border border-border"
                              style={{ background: variant.colourHex }}
                            />
                            <span className="font-medium text-foreground">{variant.name}</span>
                          </span>
                        </TableCell>
                        <TableCell className="px-0 py-2 font-mono text-xs text-muted-foreground">
                          {variant.sku}
                        </TableCell>
                        <TableCell className="px-0 py-2 tabular-nums text-inksoft">
                          {formatMoney(variant.baseCost, product.currency)}
                        </TableCell>
                        <TableCell className="px-0 py-2">
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
                        </TableCell>
                        <TableCell className="px-0 py-2">
                          <Label htmlFor={`price_${variant.id}`} className="sr-only">
                            Price for {variant.name}
                          </Label>
                          <Input
                            id={`price_${variant.id}`}
                            name={`price_${variant.id}`}
                            inputMode="decimal"
                            defaultValue={toMajorString(variant.price, product.currency)}
                            aria-invalid={state.field === `price_${variant.id}` ? true : undefined}
                            className="w-28 tabular-nums"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </>
        )}
      </ActionForm>
    </Card>
  );
}

/**
 * Deleting the store's own copy cannot be undone, so the button arms an alert
 * dialog and the dialog's own action submits this form by id — the dialog is
 * rendered in a portal outside it.
 */
export function DeleteProductForm({ product }: { product: StoreProduct }) {
  const formId = `delete-product-${product.id}`;

  return (
    <Card className="ring-rose-200" asChild>
      <section>
        <CardHeader>
          <CardTitle asChild>
            <h2>Delete this product</h2>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Removes it from this store only. The shared catalog entry and any other client&rsquo;s copy are
            unaffected. Existing orders keep their own record of what was bought.
          </p>
        </CardHeader>
        <CardContent>
          <form id={formId} action={deleteProduct}>
            <input type="hidden" name="storeId" value={product.storeId} />
            <input type="hidden" name="productId" value={product.id} />
            <DeleteProductDialog formId={formId} name={product.name} />
          </form>
        </CardContent>
      </section>
    </Card>
  );
}

function DeleteProductDialog({ formId, name }: { formId: string; name: string }) {
  // Inside the form, so the trigger locks itself the moment the dialog's own
  // action submits it.
  const { pending } = useFormStatus();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" size="sm" disabled={pending}>
          {pending ? "Deleting…" : "Delete permanently"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this product</AlertDialogTitle>
          <AlertDialogDescription>
            &ldquo;{name}&rdquo; is removed from this store&rsquo;s catalog along with its artwork placements
            and mockups. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction type="submit" form={formId} variant="destructive" disabled={pending}>
            Delete permanently
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

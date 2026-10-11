"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
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
import { formatMoney, parseMoney, toMajorString } from "@/lib/util";
import { cn } from "@/lib/utils";

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
  const t = useTranslations("productForms");
  const locale = useLocale();

  return (
    <Card asChild>
      <ActionForm
        action={saveProductDetails}
        submitLabel={t("saveDetails")}
        hidden={{ storeId: product.storeId, productId: product.id }}
        actionsClassName="px-(--card-spacing)"
      >
        {(state) => (
          <>
            <CardHeader>
              <CardTitle asChild>
                <h2>{t("details")}</h2>
              </CardTitle>
            </CardHeader>

            <CardContent className="grid gap-5 lg:grid-cols-2">
              <div className="grid content-start gap-1.5">
                <Label htmlFor="name">{t("name")}</Label>
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
                <Label htmlFor="price">{t("price", { currency: product.currency })}</Label>
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
                  {t("landedHint", {
                    cost: formatMoney(
                      product.costs.supplierCost +
                        product.costs.customizationCost +
                        product.costs.shippingEstimate,
                      product.currency,
                      locale,
                    ),
                  })}
                </p>
              </div>

              <div className="grid gap-1.5 lg:col-span-2">
                <Label htmlFor="description">{t("description")}</Label>
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
                  {t("descriptionHint")}
                </p>
              </div>

              <div className="grid content-start gap-1.5">
                <Label htmlFor="tags">{t("tags")}</Label>
                <Input id="tags" name="tags" defaultValue={product.tags.join(", ")} aria-describedby="tags-hint" />
                <p id="tags-hint" className="text-xs text-muted-foreground">
                  {t("tagsHint")}
                </p>
              </div>

              <div className="grid content-start gap-1.5">
                <Label htmlFor="taxBracketId">{t("taxBracket")}</Label>
                <input type="hidden" name="taxBracketId" value={bracket === NO_BRACKET ? "" : bracket} />
                <Select value={bracket} onValueChange={setBracket}>
                  <SelectTrigger id="taxBracketId" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_BRACKET}>{t("noBracket")}</SelectItem>
                    {brackets.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} · {b.rate}%
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <fieldset className="lg:col-span-2">
                <legend className="text-sm leading-none font-medium text-foreground select-none">
                  {t("visibility")}
                </legend>
                <div className="mt-2 flex flex-wrap gap-2.5">
                  {[
                    { value: "public", label: t("visible"), hint: t("visibleHint") },
                    { value: "hidden", label: t("hidden"), hint: t("hiddenHint") },
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
                <legend className="px-1 text-sm font-semibold text-foreground">{t("shopperCustomisation")}</legend>
                <div className="mt-3 space-y-3">
                  <div className="flex items-start gap-3">
                    <Switch
                      id="shopperArtwork"
                      name="shopperArtwork"
                      defaultChecked={product.shopperCustomization.artworkUpload}
                      className="mt-0.5"
                    />
                    <Label htmlFor="shopperArtwork" className="block cursor-pointer font-normal">
                      <span className="block text-sm font-medium text-foreground">{t("allowArtwork")}</span>
                      <span className="text-xs text-muted-foreground">
                        {t("allowArtworkHint")}
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
                        {t("allowText")}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t("allowTextHint")}
                      </span>
                    </Label>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                      <Label htmlFor="textLabel" className="text-xs">
                        {t("fieldLabel")}
                      </Label>
                      <Input
                        id="textLabel"
                        name="textLabel"
                        defaultValue={product.shopperCustomization.textLabel}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="maxTextLength" className="text-xs">
                        {t("maxCharacters")}
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
  const t = useTranslations("productForms");
  const labels = useTranslations("labels");
  const locale = useLocale();
  // Ticked rows for "Set price"; the boxes have no name, so nothing is posted.
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const allSelected = selected.size === product.variants.length;
  const toggle = (ids: string[], on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  return (
    <Card asChild>
      <ActionForm
        action={saveVariants}
        submitLabel={t("saveVariants")}
        hidden={{ storeId: product.storeId, productId: product.id }}
        actionsClassName="px-(--card-spacing)"
      >
        {(state) => (
          <>
            <CardHeader>
              <CardTitle asChild>
                <h2>{t("variants")}</h2>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {t("variantsHint")}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <VariantPriceTools product={product} selected={selected} onToggle={toggle} />
              <div className="relative overflow-x-auto">
                <Table className="min-w-[40rem]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-8 px-0">
                        <Checkbox
                          aria-label={t("selectAllVariants")}
                          checked={allSelected ? true : selected.size > 0 ? "indeterminate" : false}
                          onCheckedChange={() => toggle(product.variants.map((v) => v.id), !allSelected)}
                        />
                      </TableHead>
                      <TableHead className={TH}>{t("colEnabled")}</TableHead>
                      <TableHead className={TH}>{t("colVariant")}</TableHead>
                      <TableHead className={TH}>{t("colSku")}</TableHead>
                      <TableHead className={TH}>{t("colCost")}</TableHead>
                      <TableHead className={TH}>{t("colAvailability")}</TableHead>
                      <TableHead className={TH}>{t("colPrice", { currency: product.currency })}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {product.variants.map((variant) => (
                      <TableRow
                        key={variant.id}
                        className="hover:bg-transparent"
                        data-state={selected.has(variant.id) ? "selected" : undefined}
                      >
                        <TableCell className="w-8 px-0 py-2">
                          <Checkbox
                            aria-label={t("selectVariant", { name: variant.name })}
                            checked={selected.has(variant.id)}
                            onCheckedChange={(on) => toggle([variant.id], on === true)}
                          />
                        </TableCell>
                        <TableCell className="px-0 py-2">
                          <Label htmlFor={`enabled_${variant.id}`} className="sr-only">
                            {t("enable", { name: variant.name })}
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
                          {formatMoney(variant.baseCost, product.currency, locale)}
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
                            {labels(`availability.${variant.availability}`)}
                          </span>
                        </TableCell>
                        <TableCell className="px-0 py-2">
                          <Label htmlFor={`price_${variant.id}`} className="sr-only">
                            {t("priceFor", { name: variant.name })}
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
 * Quick select by colour or size, and one price written into every ticked
 * variant (or all of them when none is ticked). The price inputs stay the
 * form's own, so the change is kept with "Save variants" like a typed one.
 */
function VariantPriceTools({
  product,
  selected,
  onToggle,
}: {
  product: StoreProduct;
  selected: Set<string>;
  onToggle: (ids: string[], on: boolean) => void;
}) {
  const t = useTranslations("productForms");
  const ref = useRef<HTMLDivElement>(null);
  const [raw, setRaw] = useState("");
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  const groups = [
    { key: "colour" as const, label: t("colour"), values: [...new Set(product.variants.map((v) => v.colour))] },
    { key: "size" as const, label: t("size"), values: [...new Set(product.variants.map((v) => v.size))] },
  ].filter((group) => group.values.length > 1);

  function apply() {
    const price = parseMoney(raw, product.currency);
    if (price === null || price <= 0) {
      setMessage({ error: true, text: t("bulkPriceInvalid") });
      return;
    }
    const targets = selected.size > 0 ? product.variants.filter((v) => selected.has(v.id)) : product.variants;
    const form = ref.current?.closest("form");
    for (const variant of targets) {
      const input = form?.elements.namedItem(`price_${variant.id}`);
      if (input instanceof HTMLInputElement) input.value = toMajorString(price, product.currency);
    }
    setMessage({ error: false, text: t("bulkPriceApplied", { count: targets.length }) });
  }

  return (
    <div ref={ref} className="space-y-3 rounded-lg bg-muted/50 p-3 ring-1 ring-foreground/5">
      {groups.length > 0 ? (
        <div className="space-y-2">
          {groups.map((group) => (
            <div key={group.key} className="flex flex-wrap items-center gap-1.5">
              <span className="w-14 text-xs font-medium text-muted-foreground">{group.label}</span>
              {group.values.map((value) => {
                const ids = product.variants.filter((v) => v[group.key] === value).map((v) => v.id);
                const on = ids.every((id) => selected.has(id));
                const variant = product.variants.find((v) => v[group.key] === value);
                return (
                  <Button
                    key={value}
                    type="button"
                    size="xs"
                    variant={on ? "default" : "outline"}
                    aria-pressed={on}
                    onClick={() => onToggle(ids, !on)}
                  >
                    {group.key === "colour" ? (
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 rounded-full border border-border"
                        style={{ background: variant?.colourHex }}
                      />
                    ) : null}
                    {value}
                  </Button>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={`bulk-price-${product.id}`} className="text-xs">
            {t("bulkPrice", { count: selected.size })}
          </Label>
          <Input
            id={`bulk-price-${product.id}`}
            inputMode="decimal"
            autoComplete="off"
            value={raw}
            placeholder={toMajorString(product.price, product.currency)}
            onChange={(event) => {
              setRaw(event.target.value);
              setMessage(null);
            }}
            onKeyDown={(event) => {
              // Enter applies the price here rather than saving the whole form.
              if (event.key === "Enter") {
                event.preventDefault();
                apply();
              }
            }}
            aria-invalid={message?.error ? true : undefined}
            className="w-28 bg-card tabular-nums"
          />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={apply}>
          {selected.size > 0 ? t("setForSelected") : t("setForAll")}
        </Button>
        {message ? (
          <p
            role="status"
            className={cn("pb-1.5 text-xs", message.error ? "text-destructive" : "text-muted-foreground")}
          >
            {message.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Deleting the store's own copy cannot be undone, so the button arms an alert
 * dialog and the dialog's own action submits this form by id — the dialog is
 * rendered in a portal outside it.
 */
export function DeleteProductForm({ product }: { product: StoreProduct }) {
  const formId = `delete-product-${product.id}`;
  const t = useTranslations("productForms");

  return (
    <Card className="ring-rose-200" asChild>
      <section>
        <CardHeader>
          <CardTitle asChild>
            <h2>{t("deleteTitle")}</h2>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("deleteBody")}
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
  const t = useTranslations("productForms");

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" size="sm" disabled={pending}>
          {pending ? t("deleting") : t("deletePermanently")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("deleteConfirm", { name })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel />
          <AlertDialogAction type="submit" form={formId} variant="destructive" disabled={pending}>
            {t("deletePermanently")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

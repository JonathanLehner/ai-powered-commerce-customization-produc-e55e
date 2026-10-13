"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import {
  addTracking,
  raiseException,
  recordManualSubmission,
  recordRefund,
  rerouteToSupplier,
  saveOrderNotes,
  updateShippingAddress,
} from "@/app/actions/orders";
import { CountrySelect } from "@/components/CountrySelect";
import { addressRegionKind } from "@/lib/countries";
import type { ActionState } from "@/app/actions/stores";
import { ActionForm, FormStatus, SuccessToast, useSubmission, useValueRestore } from "@/components/forms";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Order, RoutingOptions, Store, SupplierChoice } from "@/lib/types";
import {
  canRestock,
  lineRefundAmount,
  refundTotal,
  refundedQuantities,
  refundedShipping,
  restockableUnits,
} from "@/lib/refunds";
import { CARRIER_LABELS, formatMoney, parseMoney, toMajorString } from "@/lib/util";

function useChoiceLabel() {
  const t = useTranslations("orderDetail");
  const labels = useTranslations("labels");
  return (choice: SupplierChoice) =>
    t("choice", {
      name: choice.name,
      kind: labels(`supplierKind.${choice.kind}`),
      min: choice.leadTimeDays[0],
      max: choice.leadTimeDays[1],
    });
}

/** A fulfilment region in the reader's language, or as stored when it is one of the supplier's own. */
function useRegionLabel() {
  const labels = useTranslations("labels");
  return (name: string) =>
    labels.has(`region.${name}` as "region.APAC") ? labels(`region.${name}` as "region.APAC") : name;
}

/**
 * Picks the production partner for a job automatic routing could not place.
 * Only suppliers that are approved, produce everything on the order for the
 * destination region, and are not the partner the job has already failed on
 * are offered — the same product-level test that raised the exception, so the
 * picker can never suggest the supplier the page has just said cannot do it.
 * When that leaves nobody, the panel drops the dropdown and the submit button
 * and names the routes forward that do exist instead.
 */
export function SupplierPickerForm({ order, options }: { order: Order; options: RoutingOptions }) {
  const needs = options.requirements.map((r) => r.label).join(", ");
  const t = useTranslations("orderDetail");
  const choiceLabel = useChoiceLabel();
  const regionLabel = useRegionLabel();

  // "Failed on" only reads true for a job routing could not place; the same
  // panel doubles as "move production elsewhere" for one already accepted.
  const held = order.fulfillment.routing !== "submitted";
  // A purchase order by hand is only a way forward when someone covers the
  // destination: with an exception open and nobody, it would resend the job
  // to the partner that cannot make it.
  const manualPossible = held && !(order.fulfillment.exception && options.manualOnly.length === 0);

  if (options.available.length === 0) {
    const current = order.fulfillment.supplierName;
    return (
      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
        <p className="font-semibold">
          {t("noSupplierFor", { needs: needs || t("theseItems"), destination: options.destination })}
        </p>
                {options.manualOnly.length > 0 ? (
          <p className="mt-1">
            {t("manualOnly", { names: options.manualOnly.map((s) => s.name).join(", ") })}
          </p>
        ) : null}
        {current ? <p className="mt-1">{t("currentSupplier", { name: current })}</p> : null}
        <p className="mt-2 font-semibold">{t("options")}</p>
        <ul className="mt-1 list-disc space-y-1 pl-4">
          {manualPossible ? (
            <li>
              {t("optionManual")}
            </li>
          ) : null}
          <li>{t("optionRefund")}</li>
          <li>
            {t("optionAdmin", { region: regionLabel(options.region) })}
          </li>
        </ul>
      </div>
    );
  }

  return (
    <ActionForm
      action={rerouteToSupplier}
      className="mt-4"
      submitLabel={t("sendJob")}
      pendingLabel={t("sending")}
      submitSize="sm"
      submitDisabled={!options.carriersEnabled}
      hidden={{ storeId: order.storeId, orderId: order.id }}
    >
      {(state) => (
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label htmlFor="supplierId">{t("alternativePartner")}</Label>
            <Select name="supplierId" defaultValue={options.available[0].id}>
              <SelectTrigger
                id="supplierId"
                className="w-full"
                aria-invalid={state.field === "supplierId" ? true : undefined}
                aria-describedby="supplierId-hint"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.available.map((choice) => (
                  <SelectItem key={choice.id} value={choice.id}>
                    {choiceLabel(choice)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p id="supplierId-hint" className="text-xs text-muted-foreground">
              {t("approvedFor", { region: regionLabel(options.region) })}
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="reroute-reason">{t("reason")}</Label>
            <Input
              id="reroute-reason"
              name="reason"
              required
              placeholder={t("reroutePlaceholder")}
              aria-invalid={state.field === "reason" ? true : undefined}
                          />
          </div>
          {!options.carriersEnabled ? (
            <p className="text-xs text-destructive">
              {t("enableCarrier")}
            </p>
          ) : null}
        </div>
      )}
    </ActionForm>
  );
}

export function ManualSubmissionForm({ order }: { order: Order }) {
  const t = useTranslations("orderDetail");
  return (
    <ActionForm
      action={recordManualSubmission}
      submitLabel={t("recordReference")}
      submitSize="sm"
      hidden={{ storeId: order.storeId, orderId: order.id }}
    >
      {(state) => (
        <div className="grid gap-1.5">
          <Label htmlFor="reference">{t("poReference")}</Label>
          <Input
            id="reference"
            name="reference"
            required
            placeholder={t("poPlaceholder")}
            aria-invalid={state.field === "reference" ? true : undefined}
                      />
        </div>
      )}
    </ActionForm>
  );
}

/** A line still to ship, as the parcel form lists it. */
export interface ShippableLine {
  itemId: string;
  name: string;
  variant: string;
  left: number;
}

/**
 * Hands a parcel to the carrier. Each line still to ship has its own quantity,
 * set to everything left, so shipping the lot is one click and a partial
 * parcel is a matter of lowering the numbers. Once nothing is left, the form
 * corrects the last parcel's tracking instead.
 */
export function TrackingForm({ order, store, lines }: { order: Order; store: Store; lines: ShippableLine[] }) {
  const enabled = store.carriers.filter((c) => c.enabled);
  const t = useTranslations("orderDetail");
  const retrack = lines.length === 0;
  return (
    <ActionForm
      action={addTracking}
      submitLabel={retrack ? t("updateTracking") : t("shipParcel")}
      submitSize="sm"
      hidden={{ storeId: order.storeId, orderId: order.id }}
    >
      {(state) => (
        <div className="space-y-4">
          {retrack ? null : (
            <fieldset>
              <legend className="text-xs font-medium text-muted-foreground">{t("unitsInParcel")}</legend>
              <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                {lines.map((line) => (
                  <li key={line.itemId} className="flex items-center gap-3 px-3 py-2">
                    <Label htmlFor={`quantity_${line.itemId}`} className="min-w-0 flex-1 flex-col items-start gap-0 font-normal">
                      <span className="truncate text-sm font-medium text-foreground">{line.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {line.variant} · {t("unitsLeft", { count: line.left })}
                      </span>
                    </Label>
                    <Input
                      id={`quantity_${line.itemId}`}
                      name={`quantity_${line.itemId}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={line.left}
                      defaultValue={line.left}
                      className="w-20 text-right tabular-nums"
                      aria-invalid={state.field === `quantity_${line.itemId}` ? true : undefined}
                    />
                  </li>
                ))}
              </ul>
            </fieldset>
          )}
          <div className="grid gap-3 @md:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="carrier">{t("carrier")}</Label>
              <Select
                name="carrier"
                defaultValue={order.fulfillment.carrier ?? enabled[0]?.carrier ?? undefined}
                disabled={enabled.length === 0}
              >
                <SelectTrigger
                  id="carrier"
                  className="w-full"
                  aria-invalid={state.field === "carrier" ? true : undefined}
                >
                  <SelectValue placeholder={enabled.length === 0 ? t("noCarriers") : undefined} />
                </SelectTrigger>
                <SelectContent>
                  {enabled.map((c) => (
                    <SelectItem key={c.carrier} value={c.carrier}>
                      {CARRIER_LABELS[c.carrier]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="trackingNumber">{t("trackingNumber")}</Label>
              <Input
                id="trackingNumber"
                name="trackingNumber"
                defaultValue={retrack ? (order.fulfillment.trackingNumber ?? "") : ""}
                placeholder={t("trackingPlaceholder")}
                aria-invalid={state.field === "trackingNumber" ? true : undefined}
              />
            </div>
          </div>
        </div>
      )}
    </ActionForm>
  );
}

/** The team's note and tags. Neither is shown to the shopper. */
export function OrderNotesForm({ order }: { order: Order }) {
  const t = useTranslations("orderDetail");
  return (
    <ActionForm
      action={saveOrderNotes}
      submitLabel={t("saveNotes")}
      submitVariant="outline"
      submitSize="sm"
      hidden={{ storeId: order.storeId, orderId: order.id }}
    >
      {(state) => (
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label htmlFor="order-note">{t("note")}</Label>
            <Textarea
              id="order-note"
              name="note"
              rows={3}
              defaultValue={order.note ?? ""}
              aria-invalid={state.field === "note" ? true : undefined}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="order-tags">{t("tags")}</Label>
            <Input
              id="order-tags"
              name="tags"
              defaultValue={(order.tags ?? []).join(", ")}
              placeholder={t("tagsPlaceholder")}
              aria-describedby="order-tags-hint"
              aria-invalid={state.field === "tags" ? true : undefined}
            />
            <p id="order-tags-hint" className="text-xs text-muted-foreground">
              {t("tagsHint")}
            </p>
          </div>
        </div>
      )}
    </ActionForm>
  );
}

/** Where the order goes, while nothing has shipped yet. */
export function AddressForm({ order }: { order: Order }) {
  const t = useTranslations("orderDetail");
  const checkout = useTranslations("storefront.checkout");
  const [country, setCountry] = useState(order.customer.country);
  const regionKind = addressRegionKind(country);
  const { customer } = order;
  const field = (name: keyof Order["customer"], label: string, invalid: boolean, autoComplete: string, wide = false) => (
    <div className={wide ? "grid gap-1.5 @md:col-span-2" : "grid gap-1.5"}>
      <Label htmlFor={`address-${name}`}>{label}</Label>
      <Input
        id={`address-${name}`}
        name={name}
        defaultValue={String(customer[name] ?? "")}
        autoComplete={autoComplete}
        aria-invalid={invalid ? true : undefined}
      />
    </div>
  );
  return (
    <ActionForm
      action={updateShippingAddress}
      submitLabel={t("saveAddress")}
      submitSize="sm"
      hidden={{ storeId: order.storeId, orderId: order.id }}
    >
      {(state) => (
        <div className="grid gap-3 @md:grid-cols-2">
          {field("name", checkout("fullName"), state.field === "name", "name", true)}
          {field("line1", checkout("street"), state.field === "line1", "address-line1", true)}
          {field("line2", checkout("line2"), false, "address-line2", true)}
          {field("city", checkout("city"), state.field === "city", "address-level2")}
          {field("postalCode", checkout("postalCode"), state.field === "postalCode", "postal-code")}
          <div className="grid gap-1.5 @md:col-span-2">
            <Label htmlFor="address-country">{checkout("country")}</Label>
            <CountrySelect
              id="address-country"
              name="country"
              value={country}
              onChange={setCountry}
              invalid={state.field === "country"}
            />
          </div>
          {regionKind
            ? field(
                "region",
                checkout(regionKind === "state" ? "regionState" : regionKind === "province" ? "regionProvince" : "regionPrefecture"),
                state.field === "region",
                "address-level1",
              )
            : null}
          {field("phone", checkout("phone"), state.field === "phone", "tel")}
        </div>
      )}
    </ActionForm>
  );
}

export function ExceptionForm({ order }: { order: Order }) {
  const t = useTranslations("orderDetail");
  return (
    <ActionForm
      action={raiseException}
      submitLabel={t("raiseException")}
      submitVariant="destructive" submitSize="sm"
      hidden={{ storeId: order.storeId, orderId: order.id }}
    >
      {(state) => (
        <div className="grid gap-1.5">
          <Label htmlFor="note">{t("whatWrong")}</Label>
          <Textarea
            id="note"
            name="note"
            rows={2}
            required
            placeholder={t("exceptionPlaceholder")}
            aria-invalid={state.field === "note" ? true : undefined}
          />
        </div>
      )}
    </ActionForm>
  );
}

/**
 * Money leaving the store's Stripe account. The merchant picks units per line
 * and any shipping, and the amount follows; it starts at zero, so nothing is
 * refunded until something is chosen. The total is confirmed in an alert
 * dialog before the action runs. The dialog's button submits this form by id,
 * because the dialog itself is rendered in a portal outside it.
 */
export function RefundForm({ order }: { order: Order }) {
  const formId = `refund-${order.id}`;
  const t = useTranslations("orderDetail");
  const common = useTranslations("common");
  const locale = useLocale();
  const money = (minor: number) => formatMoney(minor, order.currency, locale);

  const done = refundedQuantities(order);
  const restockable = restockableUnits(order);
  const shippingLeft = Math.max(0, order.shipping - refundedShipping(order));

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [restock, setRestock] = useState<Record<string, boolean>>({});
  const [shipping, setShipping] = useState("");
  const [amount, setAmount] = useState(toMajorString(0, order.currency));

  /** Recalculates the amount from a new selection, replacing any edit to it. */
  const recalculate = (next: { quantities?: Record<string, number>; shipping?: string }) => {
    const q = next.quantities ?? quantities;
    const total = refundTotal(
      order,
      order.items.map((item) => ({ itemId: item.id, quantity: q[item.id] ?? 0, restock: false })),
      Math.min(parseMoney(next.shipping ?? shipping, order.currency) ?? 0, shippingLeft),
    );
    setAmount(toMajorString(total, order.currency));
  };
  const entered = parseMoney(amount, order.currency) ?? 0;
  const restockCount = order.items.reduce(
    (sum, item) => sum + (canRestock(restockable, item) && (restock[item.id] ?? true) ? (quantities[item.id] ?? 0) : 0),
    0,
  );

  const [{ state, attempt }, formAction, pending] = useSubmission<ActionState>(recordRefund, {
    status: "idle",
  });
  const { formRef, capture } = useValueRestore(state.status, attempt);

  // An accepted refund clears the selection, so the next one starts from zero.
  const [cleared, setCleared] = useState(attempt);
  if (state.status === "success" && cleared !== attempt) {
    setCleared(attempt);
    setQuantities({});
    setRestock({});
    setShipping("");
    setAmount(toMajorString(0, order.currency));
  }

  return (
    <form
      id={formId}
      ref={formRef}
      action={(formData: FormData) => {
        capture(formData);
        formAction(formData);
      }}
      noValidate
    >
      <SuccessToast state={state} />
      <input type="hidden" name="storeId" value={order.storeId} />
      <input type="hidden" name="orderId" value={order.id} />
      <div className="space-y-3">
        <fieldset>
          <legend className="text-xs font-medium text-muted-foreground">{t("refundItems")}</legend>
          <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
            {order.items.map((item) => {
              const left = item.quantity - (done.get(item.id) ?? 0);
              const quantity = quantities[item.id] ?? 0;
              return (
                <li key={item.id} className="space-y-2 px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <Label htmlFor={`refund_qty_${item.id}`} className="min-w-0 flex-col items-start gap-0 font-normal">
                      <span className="text-sm font-medium text-foreground">{item.productName}</span>
                      <span className="text-xs text-muted-foreground">
                        {item.variantName} · {money(lineRefundAmount(order, item, 1))} × {item.quantity}
                      </span>
                    </Label>
                    {left > 0 ? (
                      <span className="shrink-0 text-sm tabular-nums text-foreground">
                        {money(lineRefundAmount(order, item, quantity))}
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs text-muted-foreground">{t("refunded")}</span>
                    )}
                  </div>
                  {left > 0 ? (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <div className="flex items-center gap-1.5">
                        <Input
                          id={`refund_qty_${item.id}`}
                          name={`refund_qty_${item.id}`}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={left}
                          value={quantity}
                          onChange={(e) => {
                            const value = Math.min(left, Math.max(0, Math.floor(Number(e.target.value) || 0)));
                            const next = { ...quantities, [item.id]: value };
                            setQuantities(next);
                            recalculate({ quantities: next });
                          }}
                          className="w-20 text-right tabular-nums"
                          aria-invalid={state.field === `refund_qty_${item.id}` ? true : undefined}
                        />
                        <span className="text-xs text-muted-foreground tabular-nums">{t("refundOf", { count: left })}</span>
                      </div>
                      {canRestock(restockable, item) ? (
                        <Label htmlFor={`refund_restock_${item.id}`} className="cursor-pointer text-xs font-normal text-inksoft">
                          <input
                            id={`refund_restock_${item.id}`}
                            type="checkbox"
                            name={`refund_restock_${item.id}`}
                            checked={restock[item.id] ?? true}
                            onChange={(e) => setRestock({ ...restock, [item.id]: e.target.checked })}
                            className="size-4 accent-primary"
                          />
                          {t("restock")}
                        </Label>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </fieldset>
        <div className="grid gap-3 @md:grid-cols-2">
          {order.shipping > 0 ? (
            <div className="grid gap-1.5">
              <Label htmlFor="refund-shipping">{t("refundShipping", { currency: order.currency })}</Label>
              <Input
                id="refund-shipping"
                name="shipping"
                inputMode="decimal"
                placeholder={toMajorString(0, order.currency)}
                value={shipping}
                onChange={(e) => {
                  setShipping(e.target.value);
                  recalculate({ shipping: e.target.value });
                }}
                aria-invalid={state.field === "shipping" ? true : undefined}
                aria-describedby="refund-shipping-left"
              />
              <p id="refund-shipping-left" className="text-xs text-muted-foreground">
                {t("shippingLeft", { amount: money(shippingLeft) })}
              </p>
            </div>
          ) : null}
          <div className="grid gap-1.5 content-start">
            <Label htmlFor="amount">{t("amount", { currency: order.currency })}</Label>
            <Input
              id="amount"
              name="amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              aria-invalid={state.field === "amount" ? true : undefined}
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="reason">{t("reason")}</Label>
          <Input
            id="reason"
            name="reason"
            required
            placeholder={t("refundPlaceholder")}
            aria-invalid={state.field === "reason" ? true : undefined}
          />
        </div>
        <Label htmlFor="cancel" className="cursor-pointer font-normal text-inksoft">
          <input id="cancel" type="checkbox" name="cancel" className="size-4 accent-primary" />
          {t("alsoCancel")}
        </Label>
        <Label htmlFor="refund-notify" className="cursor-pointer font-normal text-inksoft">
          <input id="refund-notify" type="checkbox" name="notify" defaultChecked className="size-4 accent-primary" />
          {t("notifyCustomer")}
        </Label>
        <p className="flex items-baseline justify-between border-t border-border pt-3 text-sm">
          <span className="text-inksoft">{t("refundTotal")}</span>
          <span className="font-semibold tabular-nums text-foreground">{money(entered)}</span>
        </p>
      </div>
      <FormStatus state={state} />
      <div className="mt-5">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="destructive" size="sm" disabled={pending || entered <= 0}>
              {pending ? common("saving") : t("recordRefund")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("recordRefund")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("refundConfirm", { amount: money(entered) })}
                {restockCount > 0 ? ` ${t("restockNote", { count: restockCount })}` : null}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel />
              <AlertDialogAction type="submit" form={formId} variant="destructive" disabled={pending}>
                {t("recordRefund")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </form>
  );
}

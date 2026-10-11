"use client";

import { useTranslations } from "next-intl";
import {
  addTracking,
  raiseException,
  recordManualSubmission,
  recordRefund,
  rerouteToSupplier,
} from "@/app/actions/orders";
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
import { CARRIER_LABELS, toMajorString } from "@/lib/util";

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
          {held ? (
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

export function TrackingForm({ order, store }: { order: Order; store: Store }) {
  const enabled = store.carriers.filter((c) => c.enabled);
  const t = useTranslations("orderDetail");
  return (
    <ActionForm
      action={addTracking}
      submitLabel={order.fulfillment.trackingNumber ? t("updateTracking") : t("markShipped")}
      submitSize="sm"
      hidden={{ storeId: order.storeId, orderId: order.id }}
    >
      {(state) => (
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
              defaultValue={order.fulfillment.trackingNumber ?? ""}
              placeholder={t("trackingPlaceholder")}
              aria-invalid={state.field === "trackingNumber" ? true : undefined}
            />
          </div>
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
 * Money leaving the store's Stripe account, so the entered amount and reason
 * are confirmed in an alert dialog before the action runs. The dialog's button
 * submits this form by id, because the dialog itself is rendered in a portal
 * outside it.
 */
export function RefundForm({ order }: { order: Order }) {
  const refunded = order.refunds.reduce((sum, r) => sum + r.amount, 0);
  const remaining = order.total - refunded;
  const formId = `refund-${order.id}`;
  const t = useTranslations("orderDetail");
  const common = useTranslations("common");

  const [{ state, attempt }, formAction, pending] = useSubmission<ActionState>(recordRefund, {
    status: "idle",
  });
  const { formRef, capture } = useValueRestore(state.status, attempt);

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
        <div className="grid gap-3 @md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="amount">{t("amount", { currency: order.currency })}</Label>
            <Input
              id="amount"
              name="amount"
              inputMode="decimal"
              defaultValue={toMajorString(Math.max(0, remaining), order.currency)}
              required
              aria-invalid={state.field === "amount" ? true : undefined}
            />
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
        </div>
        <Label htmlFor="cancel" className="cursor-pointer font-normal text-inksoft">
          <input id="cancel" type="checkbox" name="cancel" className="size-4 accent-primary" />
          {t("alsoCancel")}
        </Label>
      </div>
      <FormStatus state={state} />
      <div className="mt-5">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="destructive" size="sm" disabled={pending}>
              {pending ? common("saving") : t("recordRefund")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("recordRefund")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("refundBody")}
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

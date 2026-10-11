"use client";

import { useLocale, useTranslations } from "next-intl";
import { declineQuoteRequest, recordSupplierQuote } from "@/app/actions/sourcing";
import { ActionForm, Field, SubmissionKey } from "@/components/forms";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { QuoteRequest } from "@/lib/types";

/** One supplier's quote, added to the enquiry the store raised. */
export function AddQuoteForm({
  request,
  catalogOptions,
}: {
  request: QuoteRequest;
  /** Offered only when the store described the product instead of naming a listing. */
  catalogOptions: { id: string; label: string }[];
}) {
  const id = (name: string) => `${name}-${request.id}`;
  const t = useTranslations("admin.quoteDesk");
  const locale = useLocale();
  const invalid = (field: string, error: string | undefined) => (error === field ? true : undefined);
  return (
    <ActionForm
      action={recordSupplierQuote}
      hidden={{ requestId: request.id }}
      submitLabel={(request.quotes ?? []).length > 0 ? t("addAnother") : t("record")}
      pendingLabel={t("saving")}
      submitSize="sm"
      footer={
        <span className="text-xs text-muted-foreground">{t("storeSees")}</span>
      }
    >
      {(state) => (
        <div className="grid gap-3 sm:grid-cols-3">
          <SubmissionKey status={state.status} prefix="qte" />
          <Field
            label={t("supplier")}
            htmlFor={id("supplierLabel")}
            error={state.field === "supplierLabel"}
            className="sm:col-span-2"
          >
            <Input
              id={id("supplierLabel")}
              name="supplierLabel"
              className="mt-1.5"
              aria-invalid={invalid("supplierLabel", state.field)}
            />
          </Field>
          <Field
            label={t("unitCost", { currency: request.currency })}
            htmlFor={id("unitCost")}
            error={state.field === "unitCost"}
          >
            <Input
              id={id("unitCost")}
              name="unitCost"
              inputMode="decimal"
              className="mt-1.5"
              aria-invalid={invalid("unitCost", state.field)}
            />
          </Field>
          <Field
            label={t("minimumOrder")}
            htmlFor={id("minimumOrderQuantity")}
            error={state.field === "minimumOrderQuantity"}
            hint={t("minimumHint", { count: request.quantity.toLocaleString(locale) })}
          >
            <Input
              id={id("minimumOrderQuantity")}
              name="minimumOrderQuantity"
              inputMode="numeric"
              className="mt-1.5"
              aria-invalid={invalid("minimumOrderQuantity", state.field)}
            />
          </Field>
          <Field
            label={t("productionDays")}
            htmlFor={id("leadTimeDays")}
            error={state.field === "leadTimeDays"}
          >
            <Input
              id={id("leadTimeDays")}
              name="leadTimeDays"
              inputMode="numeric"
              className="mt-1.5"
              aria-invalid={invalid("leadTimeDays", state.field)}
            />
          </Field>
          <Field
            label={t("validUntil")}
            htmlFor={id("validUntil")}
            error={state.field === "validUntil"}
            hint={t("optional")}
          >
            <Input
              id={id("validUntil")}
              name="validUntil"
              type="date"
              className="mt-1.5"
              aria-invalid={invalid("validUntil", state.field)}
            />
          </Field>
          {request.catalogProductId ? null : (
            <Field
              label={t("builtOn")}
              htmlFor={id("baseCatalogProductId")}
              error={state.field === "baseCatalogProductId"}
              className="sm:col-span-3"
            >
              <Select name="baseCatalogProductId">
                <SelectTrigger
                  id={id("baseCatalogProductId")}
                  className="mt-1.5 w-full"
                  aria-invalid={invalid("baseCatalogProductId", state.field)}
                >
                  <SelectValue placeholder={t("closestListing")} />
                </SelectTrigger>
                <SelectContent>
                  {catalogOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field
            label={t("notes")}
            htmlFor={id("notes")}
            className="sm:col-span-3"
            hint={t("notesHint")}
          >
            <Textarea id={id("notes")} name="notes" rows={2} className="mt-1.5" />
          </Field>
        </div>
      )}
    </ActionForm>
  );
}

/** No supplier took the run on. The reason goes back to the store. */
export function DeclineQuoteForm({ request }: { request: QuoteRequest }) {
  const t = useTranslations("admin.quoteDesk");
  return (
    <ActionForm
      action={declineQuoteRequest}
      hidden={{ requestId: request.id }}
      submitLabel={t("markDeclined")}
      pendingLabel={t("saving")}
      submitVariant="outline"
      submitSize="sm"
    >
      {(state) => (
        <Field
          label={t("whyDeclined")}
          htmlFor={`reason-${request.id}`}
          error={state.field === "reason"}
        >
          <Textarea
            id={`reason-${request.id}`}
            name="reason"
            rows={2}
            className="mt-1.5"
            aria-invalid={state.field === "reason" ? true : undefined}
          />
        </Field>
      )}
    </ActionForm>
  );
}

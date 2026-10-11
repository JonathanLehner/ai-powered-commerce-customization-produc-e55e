"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { requestQuote } from "@/app/actions/sourcing";
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

/**
 * What the reference picker carries for "no catalog item". Radix refuses an
 * empty option value, so the choice is posted through a hidden field that turns
 * the sentinel back into the blank the action already expects.
 */
const NO_REFERENCE = "none";

/**
 * A bulk sourcing enquiry. Opened from a quote-priced listing it is about that
 * listing; opened on its own the buyer either refers to any catalog item or
 * describes the product in their own words.
 */
export function QuoteRequestForm({
  storeId,
  listing,
  catalogOptions,
  defaultReference = "",
  regions,
  minimumOrderQuantity,
  currency,
  defaultDestination,
  contactName,
  contactEmail,
}: {
  storeId: string;
  /** Set when the form is about one listing; the reference picker is hidden. */
  listing?: { id: string };
  catalogOptions?: { id: string; label: string }[];
  defaultReference?: string;
  regions: string[];
  minimumOrderQuantity: number;
  currency: string;
  defaultDestination: string;
  contactName: string;
  contactEmail: string;
}) {
  const [reference, setReference] = useState(defaultReference || NO_REFERENCE);
  const t = useTranslations("sourcing.form");
  const labels = useTranslations("labels");
  const locale = useLocale();
  const regionLabel = (name: string) =>
    labels.has(`region.${name}` as "region.APAC") ? labels(`region.${name}` as "region.APAC") : name;

  return (
    <ActionForm
      action={requestQuote}
      hidden={listing ? { storeId, catalogId: listing.id } : { storeId }}
      submitLabel={t("send")}
      pendingLabel={t("sending")}
      footer={
        <span className="text-xs text-muted-foreground">
          {t("noPayment")}
        </span>
      }
    >
      {(state) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <SubmissionKey status={state.status} prefix="rfqfrm" />
          {listing ? null : (
            <>
              <Field
                label={t("reference")}
                htmlFor="catalogId"
                className="sm:col-span-2"
                hint={t("optional")}
              >
                <input
                  type="hidden"
                  name="catalogId"
                  value={reference === NO_REFERENCE ? "" : reference}
                />
                <Select value={reference} onValueChange={setReference}>
                  <SelectTrigger id="catalogId" className="mt-1.5 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_REFERENCE}>{t("none")}</SelectItem>
                    {catalogOptions?.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label={t("product")}
                htmlFor="productName"
                error={state.field === "productName"}
                hint={t("productHint")}
              >
                <Input
                  id="productName"
                  name="productName"
                  className="mt-1.5"
                  aria-invalid={state.field === "productName" ? true : undefined}
                />
              </Field>
            </>
          )}
          <Field
            label={t("description")}
            htmlFor="description"
            className={listing ? "sm:col-span-2" : undefined}
            error={state.field === "description"}
            hint={listing ? t("descriptionListingHint") : t("descriptionHint")}
          >
            <Textarea
              id="description"
              name="description"
              rows={3}
              className="mt-1.5"
              aria-invalid={state.field === "description" ? true : undefined}
            />
          </Field>
          <Field
            label={t("quantity")}
            htmlFor="quantity"
            error={state.field === "quantity"}
            hint={
              minimumOrderQuantity > 0
                ? t("quotedFrom", { count: minimumOrderQuantity.toLocaleString(locale) })
                : t("unitsInRun")
            }
          >
            <Input
              id="quantity"
              name="quantity"
              inputMode="numeric"
              defaultValue={minimumOrderQuantity > 0 ? String(minimumOrderQuantity) : ""}
              className="mt-1.5 tabular-nums"
              aria-invalid={state.field === "quantity" ? true : undefined}
            />
          </Field>
          <Field label={t("destination")} htmlFor="destination" error={state.field === "destination"}>
            <Select name="destination" defaultValue={defaultDestination}>
              <SelectTrigger
                id="destination"
                className="mt-1.5 w-full"
                aria-invalid={state.field === "destination" ? true : undefined}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {regions.map((region) => (
                  <SelectItem key={region} value={region}>
                    {regionLabel(region)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label={t("targetCost", { currency })}
            htmlFor="targetUnitCost"
            error={state.field === "targetUnitCost"}
            hint={t("optional")}
          >
            <Input
              id="targetUnitCost"
              name="targetUnitCost"
              inputMode="decimal"
              placeholder={t("targetPlaceholder")}
              className="mt-1.5 tabular-nums"
              aria-invalid={state.field === "targetUnitCost" ? true : undefined}
            />
          </Field>
          <Field
            label={t("neededBy")}
            htmlFor="neededBy"
            error={state.field === "neededBy"}
            hint={t("optional")}
          >
            <Input
              id="neededBy"
              name="neededBy"
              type="date"
              className="mt-1.5"
              aria-invalid={state.field === "neededBy" ? true : undefined}
            />
          </Field>
          <Field
            label={t("decoration")}
            htmlFor="customisation"
            className="sm:col-span-2"
            error={state.field === "customisation"}
            hint={t("decorationHint")}
          >
            <Textarea
              id="customisation"
              name="customisation"
              rows={3}
              className="mt-1.5"
              aria-invalid={state.field === "customisation" ? true : undefined}
            />
          </Field>
          <Field label={t("replyTo")} htmlFor="contactName" error={state.field === "contactName"}>
            <Input
              id="contactName"
              name="contactName"
              autoComplete="name"
              defaultValue={contactName}
              className="mt-1.5"
              aria-invalid={state.field === "contactName" ? true : undefined}
            />
          </Field>
          <Field label={t("replyEmail")} htmlFor="contactEmail" error={state.field === "contactEmail"}>
            <Input
              id="contactEmail"
              name="contactEmail"
              type="email"
              autoComplete="email"
              defaultValue={contactEmail}
              className="mt-1.5"
              aria-invalid={state.field === "contactEmail" ? true : undefined}
            />
          </Field>
        </div>
      )}
    </ActionForm>
  );
}

"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import {
  createGiftCatalogue,
  saveGiftAccess,
  saveGiftCatalogue,
  saveGiftProducts,
} from "@/app/actions/gifting";
import { ActionForm, Field } from "@/components/forms";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { convert } from "@/lib/pricing";
import type { GiftCatalogue, StoreProduct } from "@/lib/types";
import { formatMoney, toMajorString } from "@/lib/util";

export function CatalogueCreateForm({ storeId, currency }: { storeId: string; currency: string }) {
  const t = useTranslations("gifting");
  return (
    <ActionForm
      action={createGiftCatalogue}
      submitLabel={t("create")}
      pendingLabel={t("creating")}
      hidden={{ storeId }}
    >
      {(state) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("name")} htmlFor="name">
            <Input
              id="name"
              name="name"
              placeholder={t("namePlaceholder")}
              className="mt-1.5"
              aria-invalid={state.field === "name" ? true : undefined}
            />
          </Field>
          <Field label={t("company")} htmlFor="companyName">
            <Input
              id="companyName"
              name="companyName"
              placeholder="Northwind Technologies"
              className="mt-1.5"
              aria-invalid={state.field === "companyName" ? true : undefined}
            />
          </Field>
          <Field
            label={t("spendLimitLabel", { currency })}
            htmlFor="spendLimit"
            hint={t("spendLimitHint")}
          >
            <Input
              id="spendLimit"
              name="spendLimit"
              inputMode="decimal"
              defaultValue="75"
              className="mt-1.5 tabular-nums"
              aria-invalid={state.field === "spendLimit" ? true : undefined}
            />
          </Field>
          <Field label={t("whoMayOpen")} htmlFor="access">
            <Select name="access" defaultValue="link">
              <SelectTrigger id="access" className="mt-1.5 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="link">{t("accessLink")}</SelectItem>
                <SelectItem value="invite">{t("accessInvite")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("approverName")} htmlFor="approverName" hint={t("approverNameHint")}>
            <Input
              id="approverName"
              name="approverName"
              placeholder="Dana Whitfield"
              className="mt-1.5"
            />
          </Field>
          <Field label={t("approverEmail")} htmlFor="approverEmail">
            <Input
              id="approverEmail"
              name="approverEmail"
              type="email"
              placeholder="dana@northwind.example"
              className="mt-1.5"
              aria-invalid={state.field === "approverEmail" ? true : undefined}
            />
          </Field>
        </div>
      )}
    </ActionForm>
  );
}

export function CatalogueDetailsForm({ catalogue }: { catalogue: GiftCatalogue }) {
  const [approvalRequired, setApprovalRequired] = useState(catalogue.approvalRequired);
  const t = useTranslations("gifting");

  return (
    <ActionForm
      action={saveGiftCatalogue}
      submitLabel={t("saveDetails")}
      hidden={{ storeId: catalogue.storeId, catalogueId: catalogue.id }}
    >
      {(state) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("name")} htmlFor="name">
            <Input
              id="name"
              name="name"
              defaultValue={catalogue.name}
              className="mt-1.5"
              aria-invalid={state.field === "name" ? true : undefined}
            />
          </Field>
          <Field label={t("company")} htmlFor="companyName">
            <Input
              id="companyName"
              name="companyName"
              defaultValue={catalogue.companyName}
              className="mt-1.5"
              aria-invalid={state.field === "companyName" ? true : undefined}
            />
          </Field>
          <Field
            label={t("welcome")}
            htmlFor="intro"
            className="sm:col-span-2"
            hint={t("welcomeHint")}
          >
            <Textarea
              id="intro"
              name="intro"
              rows={3}
              defaultValue={catalogue.intro}
              placeholder={t("welcomePlaceholder")}
              className="mt-1.5"
            />
          </Field>
          <Field
            label={t("spendLimitLabel", { currency: catalogue.currency })}
            htmlFor="spendLimit"
            hint={t("spendLimitHint")}
          >
            <Input
              id="spendLimit"
              name="spendLimit"
              inputMode="decimal"
              defaultValue={toMajorString(catalogue.spendLimitPerRecipient, catalogue.currency)}
              className="mt-1.5 tabular-nums"
              aria-invalid={state.field === "spendLimit" ? true : undefined}
            />
          </Field>
          <div className="flex items-end">
            <div className="flex items-start gap-2.5 text-sm text-inksoft">
              <Switch
                id="approvalRequired"
                name="approvalRequired"
                defaultChecked={catalogue.approvalRequired}
                onCheckedChange={setApprovalRequired}
                className="mt-0.5"
              />
              <Label htmlFor="approvalRequired" className="block cursor-pointer font-normal">
                {t("requireApproval")}
              </Label>
            </div>
          </div>
          <Field label={t("approverName")} htmlFor="approverName">
            <Input
              id="approverName"
              name="approverName"
              defaultValue={catalogue.approverName}
              className="mt-1.5"
            />
          </Field>
          <Field
            label={t("approverEmail")}
            htmlFor="approverEmail"
            hint={approvalRequired ? t("approverEmailHint") : undefined}
          >
            <Input
              id="approverEmail"
              name="approverEmail"
              type="email"
              defaultValue={catalogue.approverEmail}
              className="mt-1.5"
              aria-invalid={state.field === "approverEmail" ? true : undefined}
            />
          </Field>
        </div>
      )}
    </ActionForm>
  );
}

export function CatalogueAccessForm({ catalogue }: { catalogue: GiftCatalogue }) {
  const [access, setAccess] = useState(catalogue.access);
  const t = useTranslations("gifting");

  return (
    <ActionForm
      action={saveGiftAccess}
      submitLabel={t("saveAccess")}
      hidden={{ storeId: catalogue.storeId, catalogueId: catalogue.id }}
    >
      {(state) => (
        <div className="space-y-4">
          <fieldset>
            <legend className="text-sm leading-none font-medium text-foreground select-none">
              {t("whoMayOpenCatalogue")}
            </legend>
            <div className="mt-2 space-y-2">
              {(
                [
                  {
                    value: "link",
                    title: t("accessLink"),
                    detail: t("accessLinkDetail"),
                  },
                  {
                    value: "invite",
                    title: t("accessInvite"),
                    detail: t("accessInviteDetail"),
                  },
                ] as const
              ).map((option) => (
                <Label
                  key={option.value}
                  className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5 text-sm font-normal has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                >
                  <input
                    type="radio"
                    name="access"
                    value={option.value}
                    defaultChecked={catalogue.access === option.value}
                    onChange={() => setAccess(option.value)}
                    className="mt-0.5 size-4 accent-primary"
                  />
                  <span>
                    <span className="block font-medium text-foreground">{option.title}</span>
                    <span className="block text-xs text-muted-foreground">{option.detail}</span>
                  </span>
                </Label>
              ))}
            </div>
          </fieldset>

          <Field
            label={t("invitedAddresses")}
            htmlFor="invitedEmails"
            hint={t("invitedHint")}
          >
            <Textarea
              id="invitedEmails"
              name="invitedEmails"
              rows={4}
              defaultValue={catalogue.invitedEmails.join("\n")}
              placeholder="people@northwind.example"
              aria-describedby="invitedEmails-hint"
              className="mt-1.5 font-mono text-xs"
              aria-invalid={state.field === "invitedEmails" ? true : undefined}
            />
          </Field>
          {access === "link" && catalogue.invitedEmails.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("addressesKept")}</p>
          ) : null}
        </div>
      )}
    </ActionForm>
  );
}

export function CatalogueProductsForm({
  catalogue,
  products,
}: {
  catalogue: GiftCatalogue;
  products: StoreProduct[];
}) {
  const chosen = new Set(catalogue.productIds);
  const t = useTranslations("gifting");
  const locale = useLocale();

  return (
    <ActionForm
      action={saveGiftProducts}
      submitLabel={t("saveProducts")}
      hidden={{ storeId: catalogue.storeId, catalogueId: catalogue.id }}
    >
      {(state) => (
        <div>
          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("noPublished")}
            </p>
          ) : (
            <ul
              className={
                state.field === "productIds"
                  ? "grid gap-2 rounded-lg border border-rose-300 p-2 sm:grid-cols-2"
                  : "grid gap-2 sm:grid-cols-2"
              }
            >
              {products.map((product) => (
                <li key={product.id}>
                  <Label className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5 text-sm font-normal has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <Checkbox
                      name="productIds"
                      value={product.id}
                      defaultChecked={chosen.has(product.id)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-foreground">{product.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        <span className="tabular-nums">
                          {t("productLine", {
                            price: formatMoney(product.price, product.currency, locale),
                            count: product.variants.filter((v) => v.enabled).length,
                          })}
                        </span>
                        {catalogue.spendLimitPerRecipient > 0 &&
                        convert(product.price, product.currency, catalogue.currency) >
                          catalogue.spendLimitPerRecipient
                          ? t("overLimit")
                          : ""}
                      </span>
                    </span>
                  </Label>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </ActionForm>
  );
}

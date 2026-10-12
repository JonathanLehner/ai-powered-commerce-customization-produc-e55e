"use client";

import { useTranslations } from "next-intl";
import { issueGiftCard, saveGiftCardSettings } from "@/app/actions/gift-cards";
import { ActionForm, Field, SubmissionKey } from "@/components/forms";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { GIFT_CARD_LIMITS } from "@/lib/gift-cards";

export function IssueGiftCardForm({
  storeId,
  currencies,
  defaultCurrency,
}: {
  storeId: string;
  currencies: string[];
  defaultCurrency: string;
}) {
  const t = useTranslations("giftCards");
  return (
    <ActionForm action={issueGiftCard} submitLabel={t("issue")} pendingLabel={t("issuing")} hidden={{ storeId }}>
      {(state) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <SubmissionKey status={state.status} prefix="gft" />
          <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
            <Field label={t("amount")} htmlFor="gc-amount">
              <Input
                id="gc-amount"
                name="amount"
                inputMode="decimal"
                required
                className="mt-1.5 tabular-nums"
                aria-invalid={state.field === "amount" ? true : undefined}
              />
            </Field>
            <Field label={t("currency")} htmlFor="gc-currency">
              <Select name="currency" defaultValue={defaultCurrency}>
                <SelectTrigger id="gc-currency" className="mt-1.5 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label={t("expires")} htmlFor="gc-expires" hint={t("optional")}>
            <Input
              id="gc-expires"
              name="expiresOn"
              type="date"
              className="mt-1.5"
              aria-invalid={state.field === "expiresOn" ? true : undefined}
            />
          </Field>
          <Field label={t("recipientEmail")} htmlFor="gc-email" hint={t("optional")}>
            <Input
              id="gc-email"
              name="recipientEmail"
              type="email"
              autoComplete="off"
              className="mt-1.5"
              aria-invalid={state.field === "recipientEmail" ? true : undefined}
            />
          </Field>
          <Field label={t("recipientName")} htmlFor="gc-name" hint={t("optional")}>
            <Input id="gc-name" name="recipientName" autoComplete="off" className="mt-1.5" />
          </Field>
          <Field label={t("note")} htmlFor="gc-note" hint={t("noteHint")} className="sm:col-span-2">
            <Textarea
              id="gc-note"
              name="note"
              rows={2}
              maxLength={GIFT_CARD_LIMITS.note}
              className="mt-1.5"
              aria-invalid={state.field === "note" ? true : undefined}
            />
          </Field>
          <div className="flex items-start gap-2.5 text-sm text-inksoft sm:col-span-2">
            <Switch id="gc-send" name="send" defaultChecked className="mt-0.5" />
            <Label htmlFor="gc-send" className="block cursor-pointer font-normal">
              {t("sendEmail")}
            </Label>
          </div>
        </div>
      )}
    </ActionForm>
  );
}

export function GiftCardProductForm({
  storeId,
  currency,
  defaults,
}: {
  storeId: string;
  currency: string;
  defaults: { name: string; description: string; denominations: string; published: boolean };
}) {
  const t = useTranslations("giftCards");
  return (
    <ActionForm action={saveGiftCardSettings} submitLabel={t("saveProduct")} pendingLabel={t("saving")} hidden={{ storeId }}>
      {(state) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("productName")} htmlFor="gcp-name">
            <Input
              id="gcp-name"
              name="name"
              required
              defaultValue={defaults.name}
              className="mt-1.5"
              aria-invalid={state.field === "name" ? true : undefined}
            />
          </Field>
          <Field label={t("denominations", { currency })} htmlFor="gcp-denominations" hint={t("denominationsHint")}>
            <Input
              id="gcp-denominations"
              name="denominations"
              required
              defaultValue={defaults.denominations}
              className="mt-1.5 tabular-nums"
              aria-invalid={state.field === "denominations" ? true : undefined}
              aria-describedby="gcp-denominations-hint"
            />
          </Field>
          <Field label={t("productDescription")} htmlFor="gcp-description" className="sm:col-span-2">
            <Textarea
              id="gcp-description"
              name="description"
              rows={3}
              defaultValue={defaults.description}
              className="mt-1.5"
              aria-invalid={state.field === "description" ? true : undefined}
            />
          </Field>
          <div className="flex items-start gap-2.5 text-sm text-inksoft sm:col-span-2">
            <Switch id="gcp-published" name="published" defaultChecked={defaults.published} className="mt-0.5" />
            <Label htmlFor="gcp-published" className="block cursor-pointer font-normal">
              {t("sell")}
            </Label>
          </div>
        </div>
      )}
    </ActionForm>
  );
}

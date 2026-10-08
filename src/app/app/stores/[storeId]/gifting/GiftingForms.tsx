"use client";

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
  return (
    <ActionForm
      action={createGiftCatalogue}
      submitLabel="Create catalogue"
      pendingLabel="Creating…"
      hidden={{ storeId }}
    >
      {(state) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Catalogue name" htmlFor="name" hint="What the company sees at the top of its portal.">
            <Input
              id="name"
              name="name"
              placeholder="Northwind employee gifting"
              className="mt-1.5"
              aria-invalid={state.field === "name" ? true : undefined}
            />
          </Field>
          <Field label="Company" htmlFor="companyName">
            <Input
              id="companyName"
              name="companyName"
              placeholder="Northwind Technologies"
              className="mt-1.5"
              aria-invalid={state.field === "companyName" ? true : undefined}
            />
          </Field>
          <Field
            label={`Spend limit per recipient (${currency})`}
            htmlFor="spendLimit"
            hint="0 for no limit. Checked on every recipient when a list is submitted and again before payment."
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
          <Field label="Who may open it" htmlFor="access">
            <Select name="access" defaultValue="link">
              <SelectTrigger id="access" className="mt-1.5 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="link">Anyone with the private link</SelectItem>
                <SelectItem value="invite">Only invited email addresses</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Approver name" htmlFor="approverName" hint="Leave the email empty to order without approval.">
            <Input
              id="approverName"
              name="approverName"
              placeholder="Dana Whitfield"
              className="mt-1.5"
            />
          </Field>
          <Field label="Approver email" htmlFor="approverEmail">
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

  return (
    <ActionForm
      action={saveGiftCatalogue}
      submitLabel="Save details"
      hidden={{ storeId: catalogue.storeId, catalogueId: catalogue.id }}
    >
      {(state) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Catalogue name" htmlFor="name">
            <Input
              id="name"
              name="name"
              defaultValue={catalogue.name}
              className="mt-1.5"
              aria-invalid={state.field === "name" ? true : undefined}
            />
          </Field>
          <Field label="Company" htmlFor="companyName">
            <Input
              id="companyName"
              name="companyName"
              defaultValue={catalogue.companyName}
              className="mt-1.5"
              aria-invalid={state.field === "companyName" ? true : undefined}
            />
          </Field>
          <Field
            label="Welcome message"
            htmlFor="intro"
            className="sm:col-span-2"
            hint="Shown to buyers at the top of the portal — the programme rules, who to ask, what the deadline is."
          >
            <Textarea
              id="intro"
              name="intro"
              rows={3}
              defaultValue={catalogue.intro}
              placeholder="Gifts for new joiners and client thank-yous. Orders close on the 20th of each month."
              className="mt-1.5"
            />
          </Field>
          <Field
            label={`Spend limit per recipient (${catalogue.currency})`}
            htmlFor="spendLimit"
            hint="0 for no limit."
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
                Require approval before a campaign can be paid for
                <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                  The buyer cannot reach the payment step until the approver has signed the list off.
                </span>
              </Label>
            </div>
          </div>
          <Field label="Approver name" htmlFor="approverName">
            <Input
              id="approverName"
              name="approverName"
              defaultValue={catalogue.approverName}
              className="mt-1.5"
            />
          </Field>
          <Field
            label="Approver email"
            htmlFor="approverEmail"
            hint={approvalRequired ? "Required while approval is switched on." : undefined}
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

  return (
    <ActionForm
      action={saveGiftAccess}
      submitLabel="Save access"
      hidden={{ storeId: catalogue.storeId, catalogueId: catalogue.id }}
    >
      {(state) => (
        <div className="space-y-4">
          <fieldset>
            <legend className="text-sm leading-none font-medium text-foreground select-none">
              Who may open this catalogue
            </legend>
            <div className="mt-2 space-y-2">
              {(
                [
                  {
                    value: "link",
                    title: "Anyone with the private link",
                    detail: "Good for a small buying team. Regenerating the link closes every copy already sent.",
                  },
                  {
                    value: "invite",
                    title: "Only invited email addresses",
                    detail: "Each buyer states their work email and is let in only if it is on the list below.",
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
            label="Invited addresses"
            htmlFor="invitedEmails"
            hint="One per line, or separated by commas. Removing an address closes the catalogue to it on their next visit."
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
            <p className="text-xs text-muted-foreground">Addresses are kept for when you switch this catalogue to invites.</p>
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

  return (
    <ActionForm
      action={saveGiftProducts}
      submitLabel="Save products"
      hidden={{ storeId: catalogue.storeId, catalogueId: catalogue.id }}
    >
      {(state) => (
        <div>
          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This store has no published products with approved previews, so there is nothing to offer yet.
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
                          {formatMoney(product.price, product.currency)}
                        </span>{" "}
                        · <span className="tabular-nums">
                          {product.variants.filter((v) => v.enabled).length}
                        </span>{" "}
                        options
                        {catalogue.spendLimitPerRecipient > 0 &&
                        convert(product.price, product.currency, catalogue.currency) >
                          catalogue.spendLimitPerRecipient
                          ? " · over the spend limit"
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

"use client";

import { useState } from "react";
import {
  createGiftCatalogue,
  saveGiftAccess,
  saveGiftCatalogue,
  saveGiftProducts,
} from "@/app/actions/gifting";
import { ActionForm, Field } from "@/components/forms";
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
            <input
              id="name"
              name="name"
              placeholder="Northwind employee gifting"
              className={state.field === "name" ? "input input-error" : "input"}
            />
          </Field>
          <Field label="Company" htmlFor="companyName">
            <input
              id="companyName"
              name="companyName"
              placeholder="Northwind Technologies"
              className={state.field === "companyName" ? "input input-error" : "input"}
            />
          </Field>
          <Field
            label={`Spend limit per recipient (${currency})`}
            htmlFor="spendLimit"
            hint="0 for no limit. Checked on every recipient when a list is submitted and again before payment."
          >
            <input
              id="spendLimit"
              name="spendLimit"
              inputMode="decimal"
              defaultValue="75"
              className={state.field === "spendLimit" ? "input input-error" : "input"}
            />
          </Field>
          <Field label="Who may open it" htmlFor="access">
            <select id="access" name="access" defaultValue="link" className="input">
              <option value="link">Anyone with the private link</option>
              <option value="invite">Only invited email addresses</option>
            </select>
          </Field>
          <Field label="Approver name" htmlFor="approverName" hint="Leave the email empty to order without approval.">
            <input id="approverName" name="approverName" placeholder="Dana Whitfield" className="input" />
          </Field>
          <Field label="Approver email" htmlFor="approverEmail">
            <input
              id="approverEmail"
              name="approverEmail"
              type="email"
              placeholder="dana@northwind.example"
              className={state.field === "approverEmail" ? "input input-error" : "input"}
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
            <input
              id="name"
              name="name"
              defaultValue={catalogue.name}
              className={state.field === "name" ? "input input-error" : "input"}
            />
          </Field>
          <Field label="Company" htmlFor="companyName">
            <input
              id="companyName"
              name="companyName"
              defaultValue={catalogue.companyName}
              className={state.field === "companyName" ? "input input-error" : "input"}
            />
          </Field>
          <Field
            label="Welcome message"
            htmlFor="intro"
            className="sm:col-span-2"
            hint="Shown to buyers at the top of the portal — the programme rules, who to ask, what the deadline is."
          >
            <textarea
              id="intro"
              name="intro"
              rows={3}
              defaultValue={catalogue.intro}
              placeholder="Gifts for new joiners and client thank-yous. Orders close on the 20th of each month."
              className="input"
            />
          </Field>
          <Field
            label={`Spend limit per recipient (${catalogue.currency})`}
            htmlFor="spendLimit"
            hint="0 for no limit."
          >
            <input
              id="spendLimit"
              name="spendLimit"
              inputMode="decimal"
              defaultValue={toMajorString(catalogue.spendLimitPerRecipient, catalogue.currency)}
              className={state.field === "spendLimit" ? "input input-error" : "input"}
            />
          </Field>
          <div className="flex items-end">
            <label className="flex items-start gap-2 text-sm text-inksoft">
              <input
                type="checkbox"
                name="approvalRequired"
                defaultChecked={catalogue.approvalRequired}
                onChange={(event) => setApprovalRequired(event.currentTarget.checked)}
                className="mt-0.5 h-4 w-4 rounded border-line"
              />
              <span>
                Require approval before a campaign can be paid for
                <span className="mt-0.5 block text-xs text-muted">
                  The buyer cannot reach the payment step until the approver has signed the list off.
                </span>
              </span>
            </label>
          </div>
          <Field label="Approver name" htmlFor="approverName">
            <input id="approverName" name="approverName" defaultValue={catalogue.approverName} className="input" />
          </Field>
          <Field
            label="Approver email"
            htmlFor="approverEmail"
            hint={approvalRequired ? "Required while approval is switched on." : undefined}
          >
            <input
              id="approverEmail"
              name="approverEmail"
              type="email"
              defaultValue={catalogue.approverEmail}
              className={state.field === "approverEmail" ? "input input-error" : "input"}
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
            <legend className="field-label">Who may open this catalogue</legend>
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
                <label
                  key={option.value}
                  className="flex items-start gap-3 rounded-lg border border-line px-3 py-2.5 text-sm has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50"
                >
                  <input
                    type="radio"
                    name="access"
                    value={option.value}
                    defaultChecked={catalogue.access === option.value}
                    onChange={() => setAccess(option.value)}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span>
                    <span className="block font-medium text-ink">{option.title}</span>
                    <span className="block text-xs text-muted">{option.detail}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <Field
            label="Invited addresses"
            htmlFor="invitedEmails"
            hint="One per line, or separated by commas. Removing an address closes the catalogue to it on their next visit."
          >
            <textarea
              id="invitedEmails"
              name="invitedEmails"
              rows={4}
              defaultValue={catalogue.invitedEmails.join("\n")}
              placeholder="people@northwind.example"
              aria-describedby="invitedEmails-hint"
              className={state.field === "invitedEmails" ? "input input-error font-mono text-xs" : "input font-mono text-xs"}
            />
          </Field>
          {access === "link" && catalogue.invitedEmails.length === 0 ? (
            <p className="text-xs text-muted">Addresses are kept for when you switch this catalogue to invites.</p>
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
            <p className="text-sm text-muted">
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
                  <label className="flex items-start gap-3 rounded-lg border border-line px-3 py-2.5 text-sm has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50">
                    <input
                      type="checkbox"
                      name="productIds"
                      value={product.id}
                      defaultChecked={chosen.has(product.id)}
                      className="mt-0.5 h-4 w-4 rounded border-line"
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{product.name}</span>
                      <span className="block text-xs text-muted">
                        {formatMoney(product.price, product.currency)} ·{" "}
                        {product.variants.filter((v) => v.enabled).length} options
                        {catalogue.spendLimitPerRecipient > 0 &&
                        convert(product.price, product.currency, catalogue.currency) >
                          catalogue.spendLimitPerRecipient
                          ? " · over the spend limit"
                          : ""}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </ActionForm>
  );
}

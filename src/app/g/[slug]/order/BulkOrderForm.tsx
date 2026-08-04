"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { buildCampaign, type GiftActionState } from "@/app/actions/gifting";
import { FormStatus } from "@/components/forms";
import { Badge } from "@/components/ui";
import { RECIPIENT_COLUMNS, RECIPIENT_TEMPLATE } from "@/lib/gift-recipients";
import { formatMoney } from "@/lib/util";

interface GiftOption {
  id: string;
  name: string;
  price: number;
  sizes: string[];
}

/** The two ways forward: price the list, or commit it. */
function Actions({ hasRows }: { hasRows: boolean }) {
  const { pending } = useFormStatus();
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3">
      <button type="submit" name="intent" value="check" className="btn-secondary" disabled={pending}>
        {pending ? "Reading the list…" : "Check the list"}
      </button>
      <button type="submit" name="intent" value="submit" className="btn-primary" disabled={pending}>
        {pending ? "Working…" : hasRows ? "Send for approval" : "Check and send"}
      </button>
    </div>
  );
}

export function BulkOrderForm({
  slug,
  products,
  currency,
  spendLimit,
  maxRecipients,
  approvalRequired,
  approverLabel,
  buyerEmail,
}: {
  slug: string;
  products: GiftOption[];
  currency: string;
  spendLimit: number;
  maxRecipients: number;
  approvalRequired: boolean;
  approverLabel: string;
  /** Known already when the buyer was let in on their work address. */
  buyerEmail: string | null;
}) {
  const [state, formAction] = useActionState<GiftActionState, FormData>(buildCampaign, { status: "idle" });
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  /**
   * Every field is controlled. Checking a list is a round trip that comes back
   * to the same screen, and React clears uncontrolled inputs once a form action
   * settles — which would throw away the list the buyer is in the middle of
   * correcting.
   */
  const [campaignName, setCampaignName] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmailInput, setBuyerEmailInput] = useState("");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [list, setList] = useState("");

  // A CSV is read in the browser and dropped into the same box a person pastes
  // into, so both routes submit exactly the same text and can be corrected the
  // same way.
  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setFileError(null);
    if (file.size > 512 * 1024) {
      setFileError(`${file.name} is ${(file.size / 1024).toFixed(0)} KB. Recipient lists are under 512 KB.`);
      return;
    }
    try {
      setList(await file.text());
      setFileName(file.name);
    } catch {
      setFileError("That file could not be read. Save it as CSV and try again.");
    }
  }

  const preview = state.preview;

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <input type="hidden" name="slug" value={slug} />

      <section className="card p-5">
        <h2 className="text-base font-semibold text-ink">Who is ordering</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="campaignName" className="field-label">
              Campaign name
            </label>
            <input
              id="campaignName"
              name="campaignName"
              value={campaignName}
              onChange={(event) => setCampaignName(event.currentTarget.value)}
              placeholder="Q4 client gifts"
              required
              aria-invalid={state.field === "campaignName" ? true : undefined}
              className={state.field === "campaignName" ? "input input-error" : "input"}
            />
          </div>
          <div>
            <label htmlFor="buyerName" className="field-label">
              Your name
            </label>
            <input
              id="buyerName"
              name="buyerName"
              value={buyerName}
              onChange={(event) => setBuyerName(event.currentTarget.value)}
              autoComplete="name"
              required
              aria-invalid={state.field === "buyerName" ? true : undefined}
              className={state.field === "buyerName" ? "input input-error" : "input"}
            />
          </div>
          {buyerEmail ? (
            <div className="sm:col-span-2">
              <p className="text-sm text-muted">
                Ordering as <span className="font-medium text-ink">{buyerEmail}</span>. Updates on the campaign go
                there.
              </p>
            </div>
          ) : (
            <div className="sm:col-span-2">
              <label htmlFor="buyerEmail" className="field-label">
                Your work email
              </label>
              <input
                id="buyerEmail"
                name="buyerEmail"
                type="email"
                value={buyerEmailInput}
                onChange={(event) => setBuyerEmailInput(event.currentTarget.value)}
                autoComplete="email"
                required
                aria-invalid={state.field === "buyerEmail" ? true : undefined}
                aria-describedby="buyerEmail-hint"
                className={state.field === "buyerEmail" ? "input input-error" : "input"}
              />
              <p id="buyerEmail-hint" className="field-hint">
                The approval decision and the receipt are sent here.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-base font-semibold text-ink">The gift</h2>
        <p className="mt-1 text-sm text-muted">
          Used for every row that does not name a product of its own.
          {spendLimit > 0
            ? ` Each recipient may be spent up to ${formatMoney(spendLimit, currency)}.`
            : " There is no spend limit on this programme."}
        </p>
        <div className="mt-4 space-y-2">
          {products.map((product) => (
            <label
              key={product.id}
              className="flex flex-wrap items-start gap-3 rounded-lg border border-line px-3 py-2.5 text-sm has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50"
            >
              <input
                type="radio"
                name="defaultProductId"
                value={product.id}
                checked={productId === product.id}
                onChange={() => setProductId(product.id)}
                className="mt-0.5 h-4 w-4"
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-ink">{product.name}</span>
                <span className="block text-xs text-muted">
                  {product.sizes.length > 0 ? `Sizes: ${product.sizes.join(", ")}` : "One size"}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                {formatMoney(product.price, currency)}
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-base font-semibold text-ink">Recipients</h2>
        <p className="mt-1 text-sm text-muted">
          One person per line, up to {maxRecipients}. Columns:{" "}
          <span className="font-mono text-xs text-inksoft">{RECIPIENT_COLUMNS.join(", ")}</span>. A header row is
          detected automatically, and <span className="font-mono text-xs">product</span> and{" "}
          <span className="font-mono text-xs">note</span> are optional.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="btn-secondary btn-sm cursor-pointer">
            <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" onChange={onFile} className="sr-only" />
            Upload a CSV
          </label>
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => {
              setList(RECIPIENT_TEMPLATE);
              setFileName(null);
            }}
          >
            Paste the example
          </button>
          {fileName ? <span className="text-xs text-muted">Loaded {fileName}</span> : null}
        </div>
        {fileError ? (
          <p role="alert" className="mt-2 text-sm text-rose-700">
            {fileError}
          </p>
        ) : null}

        <label htmlFor="recipients" className="sr-only">
          Recipient list
        </label>
        <textarea
          id="recipients"
          name="recipients"
          value={list}
          onChange={(event) => setList(event.currentTarget.value)}
          rows={10}
          spellCheck={false}
          placeholder={RECIPIENT_TEMPLATE}
          aria-invalid={state.field === "recipients" ? true : undefined}
          className={
            state.field === "recipients"
              ? "input input-error font-mono text-xs"
              : "input font-mono text-xs"
          }
        />

        <FormStatus state={state} />

        {preview ? (
          <div className="mt-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={preview.withIssues > 0 ? "rose" : "green"}>
                {preview.recipients} recipients
              </Badge>
              {preview.withIssues > 0 ? (
                <Badge tone="rose">{preview.withIssues} to fix</Badge>
              ) : (
                <Badge tone="brand">{formatMoney(preview.total, preview.currency)} in total</Badge>
              )}
              {preview.overflow > 0 ? (
                <Badge tone="amber">{preview.overflow} rows past the limit were not read</Badge>
              ) : null}
            </div>

            <div className="mt-3 relative overflow-x-auto rounded-lg border border-line">
              <table className="w-full min-w-[44rem] text-left text-sm">
                <thead className="bg-canvas text-xs font-semibold uppercase tracking-wide text-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2">Line</th>
                    <th scope="col" className="px-3 py-2">Recipient</th>
                    <th scope="col" className="px-3 py-2">Gift</th>
                    <th scope="col" className="px-3 py-2 text-right">Delivered</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {preview.rows.map((row) => (
                    <tr key={`${row.line}-${row.email}`} className="align-top">
                      <td className="px-3 py-2 text-xs tabular-nums text-muted">{row.line}</td>
                      <td className="px-3 py-2">
                        <p className="text-ink">{row.name || <span className="text-muted">No name</span>}</p>
                        <p className="text-xs text-muted">
                          {row.email} · {row.destination}
                        </p>
                        {row.issues.length > 0 ? (
                          <ul className="mt-1 space-y-0.5 text-xs text-rose-700">
                            {row.issues.map((issue) => (
                              <li key={issue}>{issue}</li>
                            ))}
                          </ul>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-xs text-inksoft">
                        {row.productName || "—"}
                        {row.variantName ? ` · ${row.variantName}` : ""}
                        {row.quantity > 1 ? ` × ${row.quantity}` : ""}
                      </td>
                      <td className="px-3 py-2 text-right text-sm tabular-nums text-ink">
                        {row.issues.length > 0 ? "—" : formatMoney(row.total, preview.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {preview.withIssues === 0 ? (
              <dl className="mt-4 max-w-xs space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">Gifts</dt>
                  <dd className="tabular-nums text-ink">{formatMoney(preview.subtotal, preview.currency)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Delivery</dt>
                  <dd className="tabular-nums text-ink">{formatMoney(preview.shipping, preview.currency)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Tax</dt>
                  <dd className="tabular-nums text-ink">{formatMoney(preview.taxAmount, preview.currency)}</dd>
                </div>
                <div className="flex justify-between border-t border-line pt-1.5">
                  <dt className="font-semibold text-ink">Total</dt>
                  <dd className="font-semibold tabular-nums text-ink">
                    {formatMoney(preview.total, preview.currency)}
                  </dd>
                </div>
              </dl>
            ) : null}
          </div>
        ) : null}

        <p className="mt-4 text-xs text-muted">
          {approvalRequired
            ? `Sending puts the campaign in front of ${approverLabel}. Nothing is charged until it is approved and you pay.`
            : "This programme needs no approval, so you go straight to payment once the list is clean."}
        </p>

        <Actions hasRows={Boolean(preview && preview.withIssues === 0)} />
      </section>
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { buildCampaign, type GiftActionState } from "@/app/actions/gifting";
import { FormStatus } from "@/components/forms";
import { Badge } from "@/components/ui";
import { RECIPIENT_COLUMNS, RECIPIENT_TEMPLATE } from "@/lib/gift-recipients";
import { fmt, fmtAround, type StorefrontCopy } from "@/lib/i18n";
import { formatMoney } from "@/lib/util";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";

/** The largest recipient list a browser is asked to read, in KB. */
const MAX_LIST_KB = 512;

interface GiftOption {
  id: string;
  name: string;
  price: number;
  sizes: string[];
}

/** The two ways forward: price the list, or commit it. */
function Actions({ hasRows, t }: { hasRows: boolean; t: StorefrontCopy["gift"] }) {
  const { pending } = useFormStatus();
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3">
      <Button type="submit" name="intent" value="check" variant="outline" disabled={pending}>
        {pending ? t.checkPending : t.checkList}
      </Button>
      <Button type="submit" name="intent" value="submit"  disabled={pending}>
        {pending ? t.sendPending : hasRows ? t.sendForApproval : t.checkAndSend}
      </Button>
    </div>
  );
}

/**
 * The hint under the recipient box names two optional columns in the mono type
 * the columns themselves are shown in. The sentence is one dictionary string,
 * so it is split around its placeholders rather than assembled from fragments
 * in English word order.
 */
function ListHintTail({ template }: { template: string }) {
  return (
    <>
      {template.split(/(\{product\}|\{note\})/).map((part, index) =>
        part === "{product}" || part === "{note}" ? (
          <span key={index} className="font-mono text-xs">
            {part === "{product}" ? "product" : "note"}
          </span>
        ) : (
          part
        ),
      )}
    </>
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
  t,
  localeTag,
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
  t: StorefrontCopy["gift"];
  /** BCP-47 tag the catalogue's money is formatted for. */
  localeTag: string;
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
    if (file.size > MAX_LIST_KB * 1024) {
      setFileError(
        fmt(t.fileTooLarge, {
          file: file.name,
          size: (file.size / 1024).toFixed(0),
          limit: MAX_LIST_KB,
        }),
      );
      return;
    }
    try {
      setList(await file.text());
      setFileName(file.name);
    } catch {
      setFileError(t.fileUnreadable);
    }
  }

  const preview = state.preview;
  const money = (minor: number, code: string) => formatMoney(minor, code, localeTag);
  // The address is rendered as a node, so the sentence is split around it and
  // each half keeps its own language's word order.
  const [orderingBefore, orderingAfter] = fmtAround(t.orderingAs, "email");

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <input type="hidden" name="slug" value={slug} />

      <Card asChild className="block overflow-visible p-5">
      <section>
        <h2 className="text-base font-semibold text-ink">{t.buyerTitle}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="campaignName">
              {t.campaignName}
            </Label>
            <Input
              id="campaignName"
              name="campaignName"
              value={campaignName}
              onChange={(event) => setCampaignName(event.currentTarget.value)}
              placeholder={t.campaignNamePlaceholder}
              required
              aria-invalid={state.field === "campaignName" ? true : undefined}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="buyerName">
              {t.buyerName}
            </Label>
            <Input
              id="buyerName"
              name="buyerName"
              value={buyerName}
              onChange={(event) => setBuyerName(event.currentTarget.value)}
              autoComplete="name"
              required
              aria-invalid={state.field === "buyerName" ? true : undefined}
              className="mt-1.5"
            />
          </div>
          {buyerEmail ? (
            <div className="sm:col-span-2">
              <p className="text-sm text-muted-foreground">
                {orderingBefore}
                <span className="font-medium text-ink">{buyerEmail}</span>
                {orderingAfter}
              </p>
            </div>
          ) : (
            <div className="sm:col-span-2">
              <Label htmlFor="buyerEmail">
                {t.buyerEmail}
              </Label>
              <Input
                id="buyerEmail"
                name="buyerEmail"
                type="email"
                value={buyerEmailInput}
                onChange={(event) => setBuyerEmailInput(event.currentTarget.value)}
                autoComplete="email"
                required
                aria-invalid={state.field === "buyerEmail" ? true : undefined}
                aria-describedby="buyerEmail-hint"
                className="mt-1.5"
              />
              <p id="buyerEmail-hint" className="mt-1.5 text-xs text-muted-foreground">
                {t.buyerEmailHint}
              </p>
            </div>
          )}
        </div>
      </section>
      </Card>

      <Card asChild className="block overflow-visible p-5">
      <section>
        <h2 className="text-base font-semibold text-ink">{t.giftTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t.giftHint}{" "}
          {spendLimit > 0
            ? fmt(t.giftHintLimit, { amount: money(spendLimit, currency) })
            : t.giftHintNoLimit}
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
                <span className="block text-xs text-muted-foreground">
                  {product.sizes.length > 0
                    ? fmt(t.sizes, { sizes: product.sizes.join(", ") })
                    : t.oneSize}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                {money(product.price, currency)}
              </span>
            </label>
          ))}
        </div>
      </section>
      </Card>

      <Card asChild className="block overflow-visible p-5">
      <section>
        <h2 className="text-base font-semibold text-ink">{t.listTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {fmt(t.listHintLead, { max: maxRecipients })}{" "}
          <span className="font-mono text-xs text-inksoft">{RECIPIENT_COLUMNS.join(", ")}</span>.{" "}
          <ListHintTail template={t.listHintTail} />
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer")}>
            <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" onChange={onFile} className="sr-only" />
            {t.uploadCsv}
          </label>
          <Button
            type="button"
            variant="ghost" size="sm"
            onClick={() => {
              setList(RECIPIENT_TEMPLATE);
              setFileName(null);
            }}
          >
            {t.pasteExample}
          </Button>
          {fileName ? (
            <span className="text-xs text-muted-foreground">{fmt(t.fileLoaded, { file: fileName })}</span>
          ) : null}
        </div>
        {fileError ? (
          <p role="alert" className="mt-2 text-sm text-rose-700">
            {fileError}
          </p>
        ) : null}

        <label htmlFor="recipients" className="sr-only">
          {t.listLabel}
        </label>
        <Textarea
          id="recipients"
          name="recipients"
          value={list}
          onChange={(event) => setList(event.currentTarget.value)}
          rows={10}
          spellCheck={false}
          placeholder={RECIPIENT_TEMPLATE}
          aria-invalid={state.field === "recipients" ? true : undefined}
          className="mt-1.5 font-mono text-xs"
        />

        <FormStatus state={state} />

        {preview ? (
          <div className="mt-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={preview.withIssues > 0 ? "rose" : "green"}>
                {fmt(t.previewRecipients, { count: preview.recipients })}
              </Badge>
              {preview.withIssues > 0 ? (
                <Badge tone="rose">{fmt(t.previewToFix, { count: preview.withIssues })}</Badge>
              ) : (
                <Badge tone="brand">
                  {fmt(t.previewTotal, { amount: money(preview.total, preview.currency) })}
                </Badge>
              )}
              {preview.overflow > 0 ? (
                <Badge tone="amber">{fmt(t.previewOverflow, { count: preview.overflow })}</Badge>
              ) : null}
            </div>

            <div className="mt-3 relative overflow-x-auto rounded-lg border border-line">
              <table className="w-full min-w-[44rem] text-left text-sm">
                <thead className="bg-canvas text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2">{t.columnLine}</th>
                    <th scope="col" className="px-3 py-2">{t.columnRecipient}</th>
                    <th scope="col" className="px-3 py-2">{t.columnGift}</th>
                    <th scope="col" className="px-3 py-2 text-right">{t.columnDelivered}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {preview.rows.map((row) => (
                    <tr key={`${row.line}-${row.email}`} className="align-top">
                      <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">{row.line}</td>
                      <td className="px-3 py-2">
                        <p className="text-ink">
                          {row.name || <span className="text-muted-foreground">{t.noName}</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">
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
                        {row.issues.length > 0 ? "—" : money(row.total, preview.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {preview.withIssues === 0 ? (
              <dl className="mt-4 max-w-xs space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t.subtotal}</dt>
                  <dd className="tabular-nums text-ink">{money(preview.subtotal, preview.currency)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t.shipping}</dt>
                  <dd className="tabular-nums text-ink">{money(preview.shipping, preview.currency)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t.tax}</dt>
                  <dd className="tabular-nums text-ink">{money(preview.taxAmount, preview.currency)}</dd>
                </div>
                <div className="flex justify-between border-t border-line pt-1.5">
                  <dt className="font-semibold text-ink">{t.total}</dt>
                  <dd className="font-semibold tabular-nums text-ink">
                    {money(preview.total, preview.currency)}
                  </dd>
                </div>
              </dl>
            ) : null}
          </div>
        ) : null}

        <p className="mt-4 text-xs text-muted-foreground">
          {approvalRequired
            ? fmt(t.approvalNote, { approver: approverLabel })
            : t.noApprovalNote}
        </p>

        <Actions hasRows={Boolean(preview && preview.withIssues === 0)} t={t} />
      </section>
      </Card>
    </form>
  );
}

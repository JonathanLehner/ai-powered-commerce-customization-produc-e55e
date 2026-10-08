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
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

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
      <Button type="submit" name="intent" value="check" variant="outline" size="lg" disabled={pending}>
        {pending ? t.checkPending : t.checkList}
      </Button>
      <Button type="submit" name="intent" value="submit" size="lg" disabled={pending}>
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
        <h2 className="font-heading text-base font-semibold text-foreground">{t.buyerTitle}</h2>
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
                <span className="font-medium text-foreground">{buyerEmail}</span>
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
        <h2 className="font-heading text-base font-semibold text-foreground">{t.giftTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t.giftHint}{" "}
          {spendLimit > 0
            ? fmt(t.giftHintLimit, { amount: money(spendLimit, currency) })
            : t.giftHintNoLimit}
        </p>
        <input type="hidden" name="defaultProductId" value={productId} />
        <ToggleGroup
          type="single"
          variant="outline"
          size="lg"
          aria-label={t.giftTitle}
          value={productId}
          onValueChange={(next) => next && setProductId(next)}
          orientation="vertical"
          className="mt-4 w-full"
        >
          {products.map((product) => (
            <ToggleGroupItem
              key={product.id}
              value={product.id}
              className="h-auto justify-between gap-3 px-3 py-2.5 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{product.name}</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {product.sizes.length > 0
                    ? fmt(t.sizes, { sizes: product.sizes.join(", ") })
                    : t.oneSize}
                </span>
              </span>
              <span className="shrink-0 font-medium tabular-nums">
                {money(product.price, currency)}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </section>
      </Card>

      <Card asChild className="block overflow-visible p-5">
      <section>
        <h2 className="font-heading text-base font-semibold text-foreground">{t.listTitle}</h2>
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

            <div className="relative mt-3 overflow-x-auto rounded-lg border border-border">
              <Table className="min-w-[44rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.columnLine}</TableHead>
                    <TableHead>{t.columnRecipient}</TableHead>
                    <TableHead>{t.columnGift}</TableHead>
                    <TableHead className="text-right">{t.columnDelivered}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.map((row) => (
                    <TableRow key={`${row.line}-${row.email}`} className="align-top">
                      <TableCell className="text-xs tabular-nums text-muted-foreground">
                        {row.line}
                      </TableCell>
                      <TableCell>
                        <p className="text-foreground">
                          {row.name || <span className="text-muted-foreground">{t.noName}</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {row.email} · {row.destination}
                        </p>
                        {row.issues.length > 0 ? (
                          <ul className="mt-1 space-y-0.5 text-xs text-destructive">
                            {row.issues.map((issue) => (
                              <li key={issue}>{issue}</li>
                            ))}
                          </ul>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs text-inksoft">
                        {row.productName || "—"}
                        {row.variantName ? ` · ${row.variantName}` : ""}
                        {row.quantity > 1 ? ` × ${row.quantity}` : ""}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-foreground">
                        {row.issues.length > 0 ? "—" : money(row.total, preview.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {preview.withIssues === 0 ? (
              <dl className="mt-4 max-w-xs space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t.subtotal}</dt>
                  <dd className="tabular-nums text-foreground">{money(preview.subtotal, preview.currency)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t.shipping}</dt>
                  <dd className="tabular-nums text-foreground">{money(preview.shipping, preview.currency)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t.tax}</dt>
                  <dd className="tabular-nums text-foreground">{money(preview.taxAmount, preview.currency)}</dd>
                </div>
                <Separator className="my-1" />
                <div className="flex justify-between">
                  <dt className="font-semibold text-foreground">{t.total}</dt>
                  <dd className="font-semibold tabular-nums text-foreground">
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

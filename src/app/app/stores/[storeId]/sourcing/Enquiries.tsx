import Link from "next/link";
import { acceptQuote, copyAcceptedQuote } from "@/app/actions/sourcing";
import { SubmitButton } from "@/components/forms";
import { Badge } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WithdrawEnquiry } from "./WithdrawEnquiry";
import {
  canAcceptQuote,
  formatQuantity,
  isOpenEnquiry,
  QUOTE_STATUS_LABELS,
  QUOTE_STATUS_NOTES,
  QUOTE_STATUS_TONES,
  quoteIsLive,
} from "@/lib/sourcing";
import type { QuoteRequest, SupplierQuote } from "@/lib/types";
import { formatDate, formatMoney } from "@/lib/util";

/** The hidden fields every enquiry action posts. */
function EnquiryFields({ storeId, request, quote }: { storeId: string; request: QuoteRequest; quote?: SupplierQuote }) {
  return (
    <>
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="requestId" value={request.id} />
      {quote ? <input type="hidden" name="quoteId" value={quote.id} /> : null}
    </>
  );
}

/** What the store does with an enquiry that has an accepted quote. */
export function AcceptedQuoteAction({ storeId, request }: { storeId: string; request: QuoteRequest }) {
  if (request.storeProductId) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link href={`/app/stores/${storeId}/catalog/${request.storeProductId}`}>
          Open the catalog product
        </Link>
      </Button>
    );
  }
  return (
    <form action={copyAcceptedQuote}>
      <EnquiryFields storeId={storeId} request={request} />
      <SubmitButton size="sm" pendingLabel="Copying…">
        Copy into catalog
      </SubmitButton>
    </form>
  );
}

/** Accept button for one quote, shown only while it can still be accepted. */
export function AcceptQuoteButton({
  storeId,
  request,
  quote,
}: {
  storeId: string;
  request: QuoteRequest;
  quote: SupplierQuote;
}) {
  if (!canAcceptQuote(request, quote)) return null;
  return (
    <form action={acceptQuote}>
      <EnquiryFields storeId={storeId} request={request} quote={quote} />
      <SubmitButton size="sm" pendingLabel="Accepting…">
        Accept quote
      </SubmitButton>
    </form>
  );
}

function QuoteLine({
  storeId,
  request,
  quote,
  catalogName,
  compareHref,
  comparing,
}: {
  storeId: string;
  request: QuoteRequest;
  quote: SupplierQuote;
  catalogName: (id: string) => string;
  compareHref: (key: string) => string;
  comparing: boolean;
}) {
  const accepted = request.acceptedQuoteId === quote.id;
  const live = quoteIsLive(quote);
  const vsTarget =
    request.targetUnitCost === null
      ? null
      : quote.unitCost <= request.targetUnitCost
        ? "at or under target"
        : `${formatMoney(quote.unitCost - request.targetUnitCost, request.currency)} over target`;
  return (
    <li
      className={
        accepted
          ? "rounded-lg border border-emerald-200 bg-emerald-50 p-3"
          : "rounded-lg border border-border bg-canvas p-3"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-foreground">
            <span className="font-semibold">{quote.supplierLabel}</span> ·{" "}
            <span className="font-semibold tabular-nums">{formatMoney(quote.unitCost, request.currency)}</span> a
            unit
            {vsTarget ? <span className="text-muted-foreground"> ({vsTarget})</span> : null}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Minimum <span className="tabular-nums">{formatQuantity(quote.minimumOrderQuantity)}</span> ·{" "}
            <span className="tabular-nums">{quote.leadTimeDays} days</span> production · built on{" "}
            {catalogName(quote.baseCatalogProductId)}
            {quote.validUntil ? ` · ${live ? "valid until" : "expired"} ${formatDate(quote.validUntil)}` : ""}
          </p>
          {quote.notes ? <p className="mt-1 text-xs text-inksoft">{quote.notes}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {accepted ? <Badge tone="green">Accepted</Badge> : null}
          <AcceptQuoteButton storeId={storeId} request={request} quote={quote} />
          <Button asChild variant="outline" size="sm">
            <Link href={compareHref(quote.id)} scroll={false}>
              {comparing ? "Remove from compare" : "Compare"}
            </Link>
          </Button>
        </div>
      </div>
    </li>
  );
}

/**
 * One bulk sourcing enquiry in the store's own list: what was asked for, where
 * it has got to, and every quote that came back.
 */
function EnquiryRow({
  storeId,
  request,
  catalogName,
  compareHref,
  compareIds,
}: {
  storeId: string;
  request: QuoteRequest;
  catalogName: (id: string) => string;
  compareHref: (key: string) => string;
  compareIds: string[];
}) {
  const quotes = request.quotes ?? [];
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{request.code}</span>
            <h3 className="text-sm font-semibold text-foreground">{request.productName}</h3>
            <Badge tone={QUOTE_STATUS_TONES[request.status]}>{QUOTE_STATUS_LABELS[request.status]}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatQuantity(request.quantity)} to {request.destination}
            {request.targetUnitCost === null
              ? ""
              : ` · target ${formatMoney(request.targetUnitCost, request.currency)} a unit`}{" "}
            · {request.catalogProductId ? `refers to ${catalogName(request.catalogProductId)}` : "described by the store"}{" "}
            · via {request.supplierName} · asked by {request.requestedBy} on {formatDate(request.createdAt)}
            {request.neededBy ? ` · needed by ${formatDate(request.neededBy)}` : ""}
          </p>
          {request.description ? <p className="mt-1 text-xs text-inksoft">{request.description}</p> : null}
          <p className="mt-1 text-xs text-inksoft">
            <span className="font-medium text-foreground">Decoration:</span> {request.customisation}
          </p>
          <p className="mt-2 text-sm text-inksoft">{QUOTE_STATUS_NOTES[request.status]}</p>
          {request.status === "declined" && request.declineReason ? (
            <p className="mt-1 text-xs text-muted-foreground">Reason: {request.declineReason}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {request.status === "accepted" ? <AcceptedQuoteAction storeId={storeId} request={request} /> : null}
          {request.status === "submitted" || request.status === "quoted" ? (
            <WithdrawEnquiry storeId={storeId} requestId={request.id} code={request.code} />
          ) : null}
        </div>
      </div>
      {quotes.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {quotes.map((quote) => (
            <QuoteLine
              key={quote.id}
              storeId={storeId}
              request={request}
              quote={quote}
              catalogName={catalogName}
              compareHref={compareHref}
              comparing={compareIds.includes(quote.id)}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function Enquiries({
  storeId,
  requests,
  catalogName,
  compareHref,
  compareIds,
  startHref,
}: {
  storeId: string;
  requests: QuoteRequest[];
  catalogName: (id: string) => string;
  compareHref: (key: string) => string;
  compareIds: string[];
  startHref: string;
}) {
  const open = requests.filter(isOpenEnquiry).length;
  return (
    <Card asChild className="scroll-mt-6">
    <section id="enquiries">
        <CardHeader>
          <CardTitle asChild>
            <h2>Bulk sourcing enquiries</h2>
          </CardTitle>
          <p className="max-w-3xl text-sm text-inksoft">
            <span className="tabular-nums">{open}</span> open ·{" "}
            <span className="tabular-nums">{requests.length}</span> in total, newest first. Quotes the
            sourcing desk records land here and can be compared side by side with the print-on-demand
            listings above.
          </p>
          <CardAction>
            <Button asChild variant="outline" size="sm">
              <Link href={startHref} scroll={false}>
                Start a bulk enquiry
              </Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {requests.map((request) => (
              <EnquiryRow
                key={request.id}
                storeId={storeId}
                request={request}
                catalogName={catalogName}
                compareHref={compareHref}
                compareIds={compareIds}
              />
            ))}
          </ul>
        </CardContent>
    </section>
    </Card>
  );
}

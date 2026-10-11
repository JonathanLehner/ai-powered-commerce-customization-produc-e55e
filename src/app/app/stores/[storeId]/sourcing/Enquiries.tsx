import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { acceptQuote, copyAcceptedQuote } from "@/app/actions/sourcing";
import { SubmitButton } from "@/components/forms";
import { Badge } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WithdrawEnquiry } from "./WithdrawEnquiry";
import {
  canAcceptQuote,
  isOpenEnquiry,
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
export async function AcceptedQuoteAction({ storeId, request }: { storeId: string; request: QuoteRequest }) {
  const t = await getTranslations("enquiries");
  if (request.storeProductId) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link href={`/app/stores/${storeId}/catalog/${request.storeProductId}`}>
          {t("openProduct")}
        </Link>
      </Button>
    );
  }
  return (
    <form action={copyAcceptedQuote}>
      <EnquiryFields storeId={storeId} request={request} />
      <SubmitButton size="sm" pendingLabel={t("copying")}>
        {t("copyIntoCatalog")}
      </SubmitButton>
    </form>
  );
}

/** Accept button for one quote, shown only while it can still be accepted. */
export async function AcceptQuoteButton({
  storeId,
  request,
  quote,
}: {
  storeId: string;
  request: QuoteRequest;
  quote: SupplierQuote;
}) {
  if (!canAcceptQuote(request, quote)) return null;
  const t = await getTranslations("enquiries");
  return (
    <form action={acceptQuote}>
      <EnquiryFields storeId={storeId} request={request} quote={quote} />
      <SubmitButton size="sm" pendingLabel={t("accepting")}>
        {t("acceptQuote")}
      </SubmitButton>
    </form>
  );
}

async function QuoteLine({
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
  const [t, sourcing, locale] = await Promise.all([
    getTranslations("enquiries"),
    getTranslations("sourcing"),
    getLocale(),
  ]);
  const accepted = request.acceptedQuoteId === quote.id;
  const live = quoteIsLive(quote);
  const vsTarget =
    request.targetUnitCost === null
      ? null
      : quote.unitCost <= request.targetUnitCost
        ? t("underTarget")
        : t("overTarget", { amount: formatMoney(quote.unitCost - request.targetUnitCost, request.currency, locale) });
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
            <span className="font-semibold tabular-nums">
              {t("aUnit", { amount: formatMoney(quote.unitCost, request.currency, locale) })}
            </span>
            {vsTarget ? <span className="text-muted-foreground"> ({vsTarget})</span> : null}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("quoteMeta", {
              quantity: sourcing("units", { count: quote.minimumOrderQuantity }),
              days: quote.leadTimeDays,
              base: catalogName(quote.baseCatalogProductId),
            })}
            {quote.validUntil
              ? t(live ? "validUntil" : "expired", { date: formatDate(quote.validUntil, locale) })
              : ""}
          </p>
          {quote.notes ? <p className="mt-1 text-xs text-inksoft">{quote.notes}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {accepted ? <Badge tone="green">{t("accepted")}</Badge> : null}
          <AcceptQuoteButton storeId={storeId} request={request} quote={quote} />
          <Button asChild variant="outline" size="sm">
            <Link href={compareHref(quote.id)} scroll={false}>
              {comparing ? t("removeCompare") : t("compare")}
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
async function EnquiryRow({
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
  const [t, sourcing, labels, locale] = await Promise.all([
    getTranslations("enquiries"),
    getTranslations("sourcing"),
    getTranslations("labels"),
    getLocale(),
  ]);
  const destination = labels.has(`region.${request.destination}` as "region.APAC")
    ? labels(`region.${request.destination}` as "region.APAC")
    : request.destination;
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{request.code}</span>
            <h3 className="text-sm font-semibold text-foreground">{request.productName}</h3>
            <Badge tone={QUOTE_STATUS_TONES[request.status]}>{labels(`quoteStatus.${request.status}`)}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("quantityTo", { quantity: sourcing("units", { count: request.quantity }), destination })}
            {request.targetUnitCost === null
              ? ""
              : t("targetUnit", { amount: formatMoney(request.targetUnitCost, request.currency, locale) })}{" "}
            ·{" "}
            {request.catalogProductId
              ? t("refersTo", { name: catalogName(request.catalogProductId) })
              : t("describedByStore")}{" "}
            · {t("via", { supplier: request.supplierName })} ·{" "}
            {t("askedBy", { name: request.requestedBy, date: formatDate(request.createdAt, locale) })}
            {request.neededBy ? t("neededBy", { date: formatDate(request.neededBy, locale) }) : ""}
          </p>
          {request.description ? <p className="mt-1 text-xs text-inksoft">{request.description}</p> : null}
          <p className="mt-1 text-xs text-inksoft">
            <span className="font-medium text-foreground">{t("decoration")}</span> {request.customisation}
          </p>
          <p className="mt-2 text-sm text-inksoft">{labels(`quoteStatusNote.${request.status}`)}</p>
          {request.status === "declined" && request.declineReason ? (
            <p className="mt-1 text-xs text-muted-foreground">{t("reason", { reason: request.declineReason })}</p>
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

export async function Enquiries({
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
  const t = await getTranslations("enquiries");
  return (
    <Card asChild className="scroll-mt-6">
    <section id="enquiries">
        <CardHeader>
          <CardTitle asChild>
            <h2>{t("title")}</h2>
          </CardTitle>
          <p className="max-w-3xl text-sm text-inksoft">
            <span className="tabular-nums">{t("counts", { open, total: requests.length })}</span>
          </p>
          <CardAction>
            <Button asChild variant="outline" size="sm">
              <Link href={startHref} scroll={false}>
                {t("start")}
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

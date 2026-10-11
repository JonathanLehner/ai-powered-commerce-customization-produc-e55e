import { getLocale, getTranslations } from "next-intl/server";
import { Badge, DataList, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { listAllQuoteRequests, listCatalogProducts } from "@/lib/data";
import { QUOTE_STATUS_TONES, quoteIsLive } from "@/lib/sourcing";
import { formatDate, formatDateTime, formatMoney } from "@/lib/util";
import { AddQuoteForm, DeclineQuoteForm } from "./QuoteDeskForms";

/**
 * The sourcing desk's queue: every bulk sourcing enquiry a store has raised.
 * Marketplaces have no quote API, so a buyer works the enquiry with suppliers
 * and records each quote that comes back here — the store then compares them
 * with the print-on-demand options and accepts one.
 */
export default async function AdminQuotesPage() {
  const [requests, catalog] = await Promise.all([listAllQuoteRequests(), listCatalogProducts()]);
  const open = requests.filter((r) => r.status === "submitted");
  const quoted = requests.filter((r) => r.status === "quoted");
  const accepted = requests.filter((r) => r.status === "accepted");
  const [pages, t, catalogT, labels, locale] = await Promise.all([
    getTranslations("pages.admin"),
    getTranslations("admin.quotes"),
    getTranslations("admin.catalog"),
    getTranslations("labels"),
    getLocale(),
  ]);
  const catalogName = (id: string) => catalog.find((c) => c.id === id)?.name ?? t("retiredListing");
  const catalogOptions = catalog
    .filter((c) => c.status === "active")
    .map((c) => ({ id: c.id, label: `${c.name} · ${catalogT(c.category)}` }));
  const money = (minor: number, currency: string) => formatMoney(minor, currency, locale);
  const units = (count: number) => t("units", { count });
  const region = (name: string) =>
    labels.has(`region.${name}` as "region.APAC") ? labels(`region.${name}` as "region.APAC") : name;
  return (
    <div className="space-y-6">
      <PageHeader
        title={pages("quotesTitle")}
        description={pages("quotesDescription")}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("awaitingQuotes")} value={String(open.length)} />
        <StatCard label={t("withStore")} value={String(quoted.length)} />
        <StatCard label={t("accepted")} value={String(accepted.length)} />
        <StatCard
          label={t("unitsRequested")}
          value={open.reduce((sum, r) => sum + r.quantity, 0).toLocaleString(locale)}
          sub={t("awaitingQuotes")}
        />
      </div>


      {requests.length === 0 ? (
        <EmptyState
          title={t("noEnquiries")}
          description={t("noEnquiriesBody")}
        />
      ) : null}

      <ul className="space-y-4">
        {requests.map((request) => {
          const quotes = request.quotes ?? [];
          return (
            <Card asChild key={request.id}>
            <li>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{request.code}</span>
                  <CardTitle asChild>
                    <h2>{request.productName}</h2>
                  </CardTitle>
                  <Badge tone={QUOTE_STATUS_TONES[request.status]}>{labels(`quoteStatus.${request.status}`)}</Badge>
                  {request.storeProductId ? <Badge tone="neutral">{t("copied")}</Badge> : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("raisedBy", {
                    store: request.storeName,
                    supplier: request.supplierName,
                    name: request.requestedBy,
                    date: formatDateTime(request.createdAt, locale),
                  })}
                </p>
              </CardHeader>

              <CardContent>
                <DataList
                  rows={[
                    {
                      label: t("refersTo"),
                      value: request.catalogProductId ? catalogName(request.catalogProductId) : t("describedByStore"),
                    },
                    ...(request.description ? [{ label: t("description"), value: request.description }] : []),
                    { label: t("quantity"), value: units(request.quantity) },
                    { label: t("destination"), value: region(request.destination) },
                    {
                      label: t("targetCost"),
                      value:
                        request.targetUnitCost === null
                          ? t("noneGiven")
                          : money(request.targetUnitCost, request.currency),
                    },
                    {
                      label: t("neededBy"),
                      value: request.neededBy ? formatDate(request.neededBy, locale) : t("noDate"),
                    },
                    { label: t("decoration"), value: request.customisation },
                    { label: t("replyTo"), value: `${request.contactName} · ${request.contactEmail}` },
                  ]}
                />

              {quotes.length > 0 ? (
                <ul className="mt-4 space-y-2">
                  {quotes.map((quote) => (
                    <li key={quote.id} className="rounded-lg border border-border bg-muted p-3 text-sm text-foreground">
                      <span className="font-semibold">{quote.supplierLabel}</span> ·{" "}
                      <span className="tabular-nums">
                        {t("quoteLine", {
                          amount: money(quote.unitCost, request.currency),
                          quantity: units(quote.minimumOrderQuantity),
                          days: quote.leadTimeDays,
                        })}
                      </span>
                      {quote.validUntil
                        ? t(quoteIsLive(quote) ? "validUntil" : "expired", { date: formatDate(quote.validUntil, locale) })
                        : ""}{" "}
                      · {t("builtOn", { base: catalogName(quote.baseCatalogProductId), name: quote.recordedBy })}
                      {request.acceptedQuoteId === quote.id ? (
                        <Badge tone="green" className="ml-2">
                          {t("acceptedByStore")}
                        </Badge>
                      ) : null}
                      {quote.notes ? <p className="mt-1 text-xs text-muted-foreground">{quote.notes}</p> : null}
                    </li>
                  ))}
                </ul>
              ) : null}

              {request.status === "declined" && request.declineReason ? (
                <p className="mt-3 text-sm text-muted-foreground">{t("declined", { reason: request.declineReason })}</p>
              ) : null}

              {request.status === "withdrawn" ? (
                <p className="mt-3 text-sm text-muted-foreground">{t("withdrawn")}</p>
              ) : request.status === "accepted" ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  {t("acceptedNote")}
                </p>
              ) : (
                <>
                  <Separator className="my-4" />
                  <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
                    <AddQuoteForm request={request} catalogOptions={catalogOptions} />
                    {request.status === "declined" ? null : <DeclineQuoteForm request={request} />}
                  </div>
                </>
              )}
              </CardContent>
            </li>
            </Card>
          );
        })}
      </ul>
    </div>
  );
}

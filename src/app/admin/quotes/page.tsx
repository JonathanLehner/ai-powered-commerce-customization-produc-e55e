import { Badge, Callout, DataList, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { listAllQuoteRequests, listCatalogProducts } from "@/lib/data";
import { formatQuantity, QUOTE_STATUS_LABELS, QUOTE_STATUS_TONES, quoteIsLive } from "@/lib/sourcing";
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
  const catalogName = (id: string) => catalog.find((c) => c.id === id)?.name ?? "a retired listing";
  const catalogOptions = catalog
    .filter((c) => c.status === "active")
    .map((c) => ({ id: c.id, label: `${c.name} · ${c.category}` }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bulk sourcing enquiries"
        description="Requests for quote raised by stores, newest first. Record every supplier quote that comes back."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Awaiting quotes" value={String(open.length)} sub="Working the suppliers" />
        <StatCard label="With the store" value={String(quoted.length)} sub="Quotes to review" />
        <StatCard label="Accepted" value={String(accepted.length)} sub="Purchase order to raise" />
        <StatCard
          label="Units requested"
          value={open.reduce((sum, r) => sum + r.quantity, 0).toLocaleString("en-US")}
          sub="Across enquiries awaiting quotes"
        />
      </div>

      <Callout tone="neutral" title="These orders stay manual">
        A quote recorded here is offered to the store that asked. Accepting it does not open an order: sourcing
        marketplaces have no order submission API, so the product the store copies in is flagged for manual
        fulfilment and a buyer raises the purchase order and confirms Trade Assurance terms.
      </Callout>

      {requests.length === 0 ? (
        <EmptyState
          title="No enquiries yet"
          description="Stores raise these from their Sourcing page, against a catalog item or in their own words."
        />
      ) : null}

      <ul className="space-y-4">
        {requests.map((request) => {
          const quotes = request.quotes ?? [];
          return (
            <li key={request.id} className="card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted">{request.code}</span>
                <h2 className="text-base font-semibold text-ink">{request.productName}</h2>
                <Badge tone={QUOTE_STATUS_TONES[request.status]}>{QUOTE_STATUS_LABELS[request.status]}</Badge>
                {request.storeProductId ? <Badge tone="neutral">Copied into the store</Badge> : null}
              </div>
              <p className="mt-1 text-xs text-muted">
                {request.storeName} · {request.supplierName} · raised by {request.requestedBy} on{" "}
                {formatDateTime(request.createdAt)}
              </p>

              <div className="mt-4">
                <DataList
                  rows={[
                    {
                      label: "Refers to",
                      value: request.catalogProductId ? catalogName(request.catalogProductId) : "Described by the store",
                    },
                    ...(request.description ? [{ label: "Description", value: request.description }] : []),
                    { label: "Quantity", value: formatQuantity(request.quantity) },
                    { label: "Destination market", value: request.destination },
                    {
                      label: "Target unit cost",
                      value:
                        request.targetUnitCost === null
                          ? "None given"
                          : formatMoney(request.targetUnitCost, request.currency),
                    },
                    { label: "Needed by", value: request.neededBy ? formatDate(request.neededBy) : "No fixed date" },
                    { label: "Decoration needed", value: request.customisation },
                    { label: "Reply to", value: `${request.contactName} · ${request.contactEmail}` },
                  ]}
                />
              </div>

              {quotes.length > 0 ? (
                <ul className="mt-4 space-y-2">
                  {quotes.map((quote) => (
                    <li key={quote.id} className="rounded-lg border border-line bg-canvas p-3 text-sm text-ink">
                      <span className="font-semibold">{quote.supplierLabel}</span> ·{" "}
                      <span className="font-semibold tabular-nums">{formatMoney(quote.unitCost, request.currency)}</span>{" "}
                      a unit · minimum {formatQuantity(quote.minimumOrderQuantity)} · {quote.leadTimeDays} days
                      production
                      {quote.validUntil
                        ? ` · ${quoteIsLive(quote) ? "valid until" : "expired"} ${formatDate(quote.validUntil)}`
                        : ""}{" "}
                      · built on {catalogName(quote.baseCatalogProductId)} · recorded by {quote.recordedBy}
                      {request.acceptedQuoteId === quote.id ? (
                        <Badge tone="green" className="ml-2">
                          Accepted by the store
                        </Badge>
                      ) : null}
                      {quote.notes ? <p className="mt-1 text-xs text-muted">{quote.notes}</p> : null}
                    </li>
                  ))}
                </ul>
              ) : null}

              {request.status === "declined" && request.declineReason ? (
                <p className="mt-3 text-sm text-inksoft">Declined: {request.declineReason}</p>
              ) : null}

              {request.status === "withdrawn" ? (
                <p className="mt-3 text-sm text-muted">The store withdrew this enquiry, so nothing is owed to it.</p>
              ) : request.status === "accepted" ? (
                <p className="mt-3 text-sm text-muted">
                  The store accepted a quote. Raise the purchase order with that supplier when orders arrive.
                </p>
              ) : (
                <div className="mt-4 grid gap-5 border-t border-line pt-4 lg:grid-cols-[3fr_2fr]">
                  <AddQuoteForm request={request} catalogOptions={catalogOptions} />
                  {request.status === "declined" ? null : <DeclineQuoteForm request={request} />}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

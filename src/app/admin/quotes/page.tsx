import { Badge, Callout, DataList, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { listAllQuoteRequests } from "@/lib/data";
import {
  formatQuantity,
  QUOTE_STATUS_LABELS,
  QUOTE_STATUS_TONES,
  quoteIsUsable,
} from "@/lib/sourcing";
import { formatDate, formatDateTime, formatMoney } from "@/lib/util";
import { AnswerQuoteForm, DeclineQuoteForm } from "./QuoteDeskForms";

/**
 * The sourcing desk's queue: every request for quote a store has raised against
 * a bulk-sourcing listing. Marketplaces have no quote API, so a buyer works the
 * enquiry with the supplier and records what came back here — that price is
 * what lets the store copy the listing in and sell it.
 */
export default async function AdminQuotesPage() {
  const requests = await listAllQuoteRequests();
  const open = requests.filter((r) => r.status === "submitted");
  const quoted = requests.filter((r) => r.status === "quoted");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bulk sourcing requests"
        description="Requests for quote raised by stores against sourcing-marketplace listings, newest first."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Requests" value={String(requests.length)} />
        <StatCard label="Awaiting a quote" value={String(open.length)} sub="Working the supplier" />
        <StatCard label="Quoted" value={String(quoted.length)} sub="Store can copy the listing in" />
        <StatCard
          label="Units requested"
          value={open.reduce((sum, r) => sum + r.quantity, 0).toLocaleString("en-US")}
          sub="Across open requests"
        />
      </div>

      <Callout tone="neutral" title="These orders stay manual">
        A quote recorded here prices the listing for the store that asked. It does not open an order: sourcing
        marketplaces have no order submission API, so anything sold from the copied product is flagged for a
        buyer to raise the purchase order and confirm Trade Assurance terms.
      </Callout>

      {requests.length === 0 ? (
        <EmptyState
          title="No quote requests yet"
          description="Stores raise these from the sourcing page of a bulk-sourcing listing."
        />
      ) : null}

      <ul className="space-y-4">
        {requests.map((request) => (
          <li key={request.id} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted">{request.code}</span>
                  <h2 className="text-base font-semibold text-ink">{request.productName}</h2>
                  <Badge tone={QUOTE_STATUS_TONES[request.status]}>{QUOTE_STATUS_LABELS[request.status]}</Badge>
                  {request.status === "quoted" && !quoteIsUsable(request) ? (
                    <Badge tone="amber">Quote expired</Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-muted">
                  {request.storeName} · {request.supplierName} · raised by {request.requestedBy} on{" "}
                  {formatDateTime(request.createdAt)}
                </p>
              </div>
            </div>

            <div className="mt-4">
              <DataList
                rows={[
                  { label: "Run size", value: formatQuantity(request.quantity) },
                  { label: "Delivered to", value: request.destination },
                  {
                    label: "Target unit price",
                    value:
                      request.targetUnitCost === null
                        ? "None given"
                        : formatMoney(request.targetUnitCost, request.currency),
                  },
                  { label: "Needed by", value: request.neededBy ? formatDate(request.neededBy) : "No fixed date" },
                  { label: "Reply to", value: `${request.contactName} · ${request.contactEmail}` },
                  { label: "Specification", value: request.customisation },
                ]}
              />
            </div>

            {request.response && request.status === "quoted" ? (
              <p className="mt-3 text-sm text-ink">
                Quoted{" "}
                <span className="font-semibold tabular-nums">
                  {formatMoney(request.response.unitCost, request.currency)}
                </span>{" "}
                a unit · {request.response.leadTimeDays} days production
                {request.response.validUntil ? ` · valid until ${formatDate(request.response.validUntil)}` : ""} ·
                recorded by {request.response.answeredBy}
              </p>
            ) : null}
            {request.status === "declined" && request.response ? (
              <p className="mt-3 text-sm text-inksoft">
                Declined by {request.response.answeredBy}: {request.response.notes}
              </p>
            ) : null}

            {request.status === "withdrawn" ? (
              <p className="mt-3 text-sm text-muted">The store withdrew this request, so nothing is owed to it.</p>
            ) : (
              <div className="mt-4 grid gap-5 border-t border-line pt-4 lg:grid-cols-[3fr_2fr]">
                <AnswerQuoteForm request={request} />
                {request.status === "declined" ? null : <DeclineQuoteForm request={request} />}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

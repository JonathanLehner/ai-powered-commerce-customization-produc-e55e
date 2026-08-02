import Link from "next/link";
import { Badge, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { listOrders, listStoreProducts } from "@/lib/data";
import { storeMetrics } from "@/lib/metrics";
import { requireStoreAccess } from "@/lib/session";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/types";
import { CARRIER_LABELS, formatDate, formatMoney } from "@/lib/util";

const TONES: Record<OrderStatus, "green" | "amber" | "rose" | "brand" | "slate"> = {
  awaiting_payment: "slate",
  paid: "brand",
  in_production: "amber",
  shipped: "brand",
  delivered: "green",
  cancelled: "slate",
  exception: "rose",
};

export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ status?: string; q?: string; view?: string }>;
}) {
  const { storeId } = await params;
  const { status, q, view } = await searchParams;
  const { store } = await requireStoreAccess(storeId);

  const [orders, products] = await Promise.all([listOrders(storeId), listStoreProducts(storeId)]);
  const metrics = storeMetrics(orders, products, store.defaultCurrency);

  const filtered = orders
    .filter((o) => !status || o.status === status)
    .filter((o) =>
      view === "attention"
        ? o.status === "exception" || o.fulfillment.routing === "manual_required" || o.status === "paid"
        : true,
    )
    .filter((o) =>
      !q
        ? true
        : `${o.code} ${o.customer.name} ${o.customer.email} ${o.fulfillment.trackingNumber ?? ""}`
            .toLowerCase()
            .includes(q.toLowerCase()),
    );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Orders"
        title={`${orders.length} orders`}
        description="Every order belongs to this store. Shopper details are never shared with another client store, even inside the same agency."
        actions={
          <Link
            href={`/app/stores/${storeId}/orders${view === "attention" ? "" : "?view=attention"}`}
            className={view === "attention" ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
          >
            {view === "attention" ? "Showing needs attention" : `Needs attention (${metrics.awaitingAction})`}
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Lifetime sales"
          value={formatMoney(metrics.grossSales, store.defaultCurrency)}
          sub={`${metrics.paidOrders} paid orders`}
        />
        <StatCard label="In production" value={String(metrics.inProduction)} sub="Paid or being made" />
        <StatCard label="Shipped" value={String(metrics.shipped)} sub={`${metrics.delivered} delivered`} />
        <StatCard
          label="Exceptions"
          value={String(metrics.exceptions)}
          tone={metrics.exceptions > 0 ? "rose" : "green"}
          sub={`${metrics.manualRouting} awaiting manual routing`}
        />
      </div>

      <form method="get" className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[12rem] flex-1">
          <label htmlFor="q" className="field-label text-xs">
            Search
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Order code, customer or tracking number"
            className="input py-1.5"
          />
        </div>
        <div>
          <label htmlFor="status" className="field-label text-xs">
            Status
          </label>
          <select id="status" name="status" defaultValue={status ?? ""} className="input py-1.5">
            <option value="">All</option>
            {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((key) => (
              <option key={key} value={key}>
                {ORDER_STATUS_LABELS[key]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">
          Filter
        </button>
        {q || status || view ? (
          <Link href={`/app/stores/${storeId}/orders`} className="btn-ghost">
            Clear
          </Link>
        ) : null}
      </form>

      {filtered.length === 0 ? (
        <EmptyState
          title={orders.length === 0 ? "No orders yet" : "Nothing matches that filter"}
          description={
            orders.length === 0
              ? "Orders appear here the moment a shopper pays. Each one carries its production status, carrier tracking and any supplier exception."
              : "Try a different status or clear the search."
          }
        />
      ) : (
        <div className="card relative overflow-x-auto">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="bg-canvas text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-3">Order</th>
                <th scope="col" className="px-4 py-3">Customer</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">Fulfilment</th>
                <th scope="col" className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((order) => (
                <tr key={order.id} className="align-top">
                  <td className="px-4 py-3">
                    <Link
                      href={`/app/stores/${storeId}/orders/${order.id}`}
                      className="font-medium text-ink hover:underline"
                    >
                      {order.code}
                    </Link>
                    <p className="text-xs text-muted">{formatDate(order.createdAt)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-ink">{order.customer.name}</p>
                    <p className="text-xs text-muted">
                      {order.customer.city}, {order.customer.country}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={TONES[order.status]}>{ORDER_STATUS_LABELS[order.status]}</Badge>
                    {order.refunds.length > 0 ? (
                      <p className="mt-1 text-xs text-muted">
                        {formatMoney(
                          order.refunds.reduce((s, r) => s + r.amount, 0),
                          order.currency,
                        )}{" "}
                        refunded
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-inksoft">
                      {order.fulfillment.supplierName ?? "No supplier"} ·{" "}
                      {order.fulfillment.routing === "submitted"
                        ? "submitted"
                        : order.fulfillment.routing === "manual_required"
                          ? "manual required"
                          : order.fulfillment.routing}
                    </p>
                    {order.fulfillment.trackingNumber && order.fulfillment.carrier ? (
                      <a
                        href={order.fulfillment.trackingUrl ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-brand-700 hover:underline"
                      >
                        {CARRIER_LABELS[order.fulfillment.carrier]} {order.fulfillment.trackingNumber} ↗
                      </a>
                    ) : null}
                    {order.fulfillment.exception ? (
                      <p className="mt-1 text-xs text-rose-700">{order.fulfillment.exception}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums text-ink">
                    {formatMoney(order.total, order.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

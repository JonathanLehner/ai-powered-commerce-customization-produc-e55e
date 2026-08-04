import Link from "next/link";
import { Badge, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { listGiftCampaigns, listOrders, listStoreProducts } from "@/lib/data";
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
  searchParams: Promise<{ status?: string; q?: string; view?: string; campaign?: string }>;
}) {
  const { storeId } = await params;
  const { status, q, view, campaign } = await searchParams;
  const { store } = await requireStoreAccess(storeId);

  const [orders, products, campaigns] = await Promise.all([
    listOrders(storeId),
    listStoreProducts(storeId),
    listGiftCampaigns(storeId),
  ]);
  const metrics = storeMetrics(orders, products, store.defaultCurrency);

  // Gift campaigns sit in the same queue as ordinary orders, grouped so
  // fulfilment and exceptions can be worked one programme at a time.
  const ordered = campaigns.filter((c) => c.status === "ordered");
  const campaignRows = ordered.map((c) => {
    const own = orders.filter((o) => o.campaign?.campaignId === c.id);
    return {
      campaign: c,
      orders: own.length,
      exceptions: own.filter((o) => o.status === "exception" || o.fulfillment.routing === "manual_required").length,
      delivered: own.filter((o) => o.status === "delivered").length,
    };
  });
  const activeCampaign = campaignRows.find((row) => row.campaign.code === campaign)?.campaign ?? null;

  const filtered = orders
    .filter((o) => (campaign ? o.campaign?.campaignCode === campaign : true))
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
        title={activeCampaign ? `${activeCampaign.code} · ${activeCampaign.name}` : `${orders.length} orders`}
        description={
          activeCampaign
            ? `Every order in this gift campaign, ${activeCampaign.recipients.length} recipients from ${activeCampaign.buyer.name}.`
            : "Production and delivery status for every order placed on this store."
        }
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

      {campaignRows.length > 0 ? (
        <section className="card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-ink">Gift campaigns</h2>
            <Link href={`/app/stores/${storeId}/gifting`} className="text-sm font-medium text-brand-700 hover:underline">
              Gifting
            </Link>
          </div>
          <ul className="mt-3 flex flex-wrap gap-2">
            {campaignRows.map((row) => (
              <li key={row.campaign.id}>
                <Link
                  href={
                    campaign === row.campaign.code
                      ? `/app/stores/${storeId}/orders`
                      : `/app/stores/${storeId}/orders?campaign=${encodeURIComponent(row.campaign.code)}`
                  }
                  aria-current={campaign === row.campaign.code ? "true" : undefined}
                  className={
                    campaign === row.campaign.code
                      ? "flex flex-col rounded-lg border border-brand-400 bg-brand-50 px-3 py-2 text-left text-xs"
                      : "flex flex-col rounded-lg border border-line px-3 py-2 text-left text-xs hover:bg-canvas"
                  }
                >
                  <span className="font-semibold text-ink">
                    {row.campaign.code} · {row.campaign.name}
                  </span>
                  <span className="text-muted">
                    {row.orders} orders · {row.delivered} delivered
                    {row.exceptions > 0 ? (
                      <span className="text-rose-700"> · {row.exceptions} need attention</span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {activeCampaign ? (
            <p className="mt-3 text-xs text-muted">
              Showing {activeCampaign.code} only.{" "}
              <Link
                href={`/app/stores/${storeId}/orders/campaigns/${activeCampaign.id}`}
                className="font-medium text-brand-700 hover:underline"
              >
                Work the campaign recipient by recipient
              </Link>
              .
            </p>
          ) : null}
        </section>
      ) : null}

      <form method="get" className="card flex flex-wrap items-end gap-3 p-4">
        {campaign ? <input type="hidden" name="campaign" value={campaign} /> : null}
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
        {q || status || view || campaign ? (
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
                    {order.campaign ? (
                      <Link
                        href={`/app/stores/${storeId}/orders/campaigns/${order.campaign.campaignId}`}
                        className="mt-1 inline-block text-xs font-medium text-brand-700 hover:underline"
                      >
                        Gift · {order.campaign.campaignCode}
                      </Link>
                    ) : null}
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

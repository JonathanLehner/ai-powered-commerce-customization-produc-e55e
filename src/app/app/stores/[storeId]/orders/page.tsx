import Link from "next/link";
import { OrdersPager } from "@/components/OrdersPager";
import { OrdersToolbar } from "@/components/OrdersToolbar";
import { Badge, Dot, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listGiftCampaigns, listOrders, listStoreProducts } from "@/lib/data";
import { storeMetrics } from "@/lib/metrics";
import {
  filterOrders,
  orderListQuery,
  pageOrders,
  parseOrderFilters,
  type OrderListParams,
} from "@/lib/order-list";
import { requireStoreAccess, roleCan } from "@/lib/session";
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
  searchParams: Promise<OrderListParams>;
}) {
  const { storeId } = await params;
  const filters = parseOrderFilters(await searchParams);
  const { campaign, view } = filters;
  const { store, role, viaPlatform } = await requireStoreAccess(storeId);

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

  // The filters live in the URL, so the table, the pager and the download all
  // read the same query string and can never disagree about what they contain.
  const matched = filterOrders(orders, filters, { viaPlatform });
  const page = pageOrders(matched, filters.page);
  const base = `/app/stores/${storeId}/orders`;
  // Shopper records and order values are in the spreadsheet, so it is handed to
  // the people who work the queue rather than to platform oversight.
  const exportHref = roleCan(role, "store.orders")
    ? `${base}/export${orderListQuery(filters, { page: 1 })}`
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={activeCampaign ? `${activeCampaign.code} · ${activeCampaign.name}` : `${orders.length} orders`}
        description={
          activeCampaign
            ? viaPlatform
              ? `Every order in this gift campaign, ${activeCampaign.recipients.length} recipients.`
              : `Every order in this gift campaign, ${activeCampaign.recipients.length} recipients from ${activeCampaign.buyer.name}.`
            : viaPlatform
              ? "Production and delivery status for every order placed on this store. Shopper records stay with the store team."
              : "Production and delivery status for every order placed on this store."
        }
        actions={
          <Button asChild size="sm" variant={view === "attention" ? "default" : "outline"}>
            <Link
              href={`${base}${orderListQuery(filters, { view: view === "attention" ? null : "attention", page: 1 })}`}
              prefetch={false}
            >
              {view === "attention" ? "Showing needs attention" : `Needs attention (${metrics.awaitingAction})`}
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {viaPlatform ? (
          <StatCard label="Orders" value={String(metrics.orderCount)} sub={`${metrics.paidOrders} paid`} />
        ) : (
          <StatCard
            label="Lifetime sales"
            value={formatMoney(metrics.grossSales, store.defaultCurrency)}
            sub={`${metrics.paidOrders} paid orders`}
          />
        )}
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
        <Card size="sm" className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3 px-(--card-spacing)">
            <h2 className="font-heading text-sm font-medium text-foreground">Gift campaigns</h2>
            {viaPlatform ? null : (
              <Link
                href={`/app/stores/${storeId}/gifting`}
                className="text-sm font-medium text-primary hover:underline"
              >
                Gifting
              </Link>
            )}
          </div>
          <ul className="flex flex-wrap gap-2 px-(--card-spacing)">
            {campaignRows.map((row) => (
              <li key={row.campaign.id}>
                <Link
                  href={
                    `${base}${orderListQuery(filters, {
                      campaign: campaign === row.campaign.code ? null : row.campaign.code,
                      page: 1,
                    })}`
                  }
                  aria-current={campaign === row.campaign.code ? "true" : undefined}
                  className={
                    campaign === row.campaign.code
                      ? "flex flex-col rounded-lg border border-primary bg-primary/5 px-3 py-2 text-left text-xs"
                      : "flex flex-col rounded-lg border border-border px-3 py-2 text-left text-xs hover:bg-muted"
                  }
                >
                  <span className="font-medium text-foreground">
                    {row.campaign.code} · {row.campaign.name}
                  </span>
                  <span className="text-muted-foreground">
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
            <p className="px-(--card-spacing) text-xs text-muted-foreground">
              Showing {activeCampaign.code} only.{" "}
              <Link
                href={`/app/stores/${storeId}/orders/campaigns/${activeCampaign.id}`}
                className="font-medium text-primary hover:underline"
              >
                Work the campaign recipient by recipient
              </Link>
              .
            </p>
          ) : null}
        </Card>
      ) : null}

      <OrdersToolbar
        action={base}
        filters={filters}
        placeholder={
          viaPlatform ? "Order code or tracking number" : "Order code, customer or tracking number"
        }
        exportHref={exportHref}
      />

      {page.total === 0 ? (
        <EmptyState
          title={orders.length === 0 ? "No orders yet" : "Nothing matches that filter"}
          description={
            orders.length === 0
              ? "Orders appear here the moment a shopper pays. Each one carries its production status, carrier tracking and any supplier exception."
              : "Try a different status or clear the search."
          }
        />
      ) : (
        <div className="space-y-3">
          {/* The header stays put while the queue is read, so the column a row
              belongs to is never guessed. */}
          <Card className="py-0 [&_[data-slot=table-container]]:max-h-[36rem]">
            <Table className="min-w-[52rem]">
              <TableHeader className="sticky top-0 z-10 bg-muted">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4">Order</TableHead>
                  {viaPlatform ? null : <TableHead className="px-4">Customer</TableHead>}
                  <TableHead className="px-4">Status</TableHead>
                  <TableHead className="px-4">Fulfilment</TableHead>
                  {viaPlatform ? null : <TableHead className="px-4 text-right">Total</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.orders.map((order) => (
                  // The row is the link: the code carries it, stretched over the
                  // whole row, and the links inside it stay clickable on top.
                  <TableRow key={order.id} className="relative align-top">
                    <TableCell className="px-4 py-3">
                      <Link
                        href={`/app/stores/${storeId}/orders/${order.id}`}
                        className="font-medium text-foreground after:absolute after:inset-0 hover:underline"
                      >
                        {order.code}
                      </Link>
                      <p className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</p>
                    </TableCell>
                    {viaPlatform ? null : (
                      <TableCell className="px-4 py-3">
                        <p className="text-foreground">{order.customer.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {order.customer.city}, {order.customer.country}
                        </p>
                        {order.campaign ? (
                          <Link
                            href={`/app/stores/${storeId}/orders/campaigns/${order.campaign.campaignId}`}
                            className="relative mt-1 inline-block text-xs font-medium text-primary hover:underline"
                          >
                            Gift · {order.campaign.campaignCode}
                          </Link>
                        ) : null}
                      </TableCell>
                    )}
                    <TableCell className="px-4 py-3">
                      <Badge tone={TONES[order.status]}>
                        <Dot tone={TONES[order.status]} />
                        {ORDER_STATUS_LABELS[order.status]}
                      </Badge>
                      {order.refunds.length > 0 ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {viaPlatform
                            ? "Refunded"
                            : `${formatMoney(
                                order.refunds.reduce((s, r) => s + r.amount, 0),
                                order.currency,
                              )} refunded`}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="px-4 py-3">
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
                          className="relative text-xs font-medium text-primary hover:underline"
                        >
                          {CARRIER_LABELS[order.fulfillment.carrier]} {order.fulfillment.trackingNumber} ↗
                        </a>
                      ) : null}
                      {order.fulfillment.exception ? (
                        <p className="mt-1 text-xs text-rose-700">
                          {viaPlatform ? "Fulfilment exception raised" : order.fulfillment.exception}
                        </p>
                      ) : null}
                    </TableCell>
                    {viaPlatform ? null : (
                      <TableCell className="px-4 py-3 text-right font-medium tabular-nums text-foreground">
                        {formatMoney(order.total, order.currency)}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <OrdersPager basePath={base} filters={filters} page={page} />
        </div>
      )}
    </div>
  );
}

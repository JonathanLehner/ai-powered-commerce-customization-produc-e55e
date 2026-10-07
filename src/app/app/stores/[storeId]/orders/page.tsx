import { SearchIcon } from "lucide-react";
import Link from "next/link";
import { OrdersPager } from "@/components/OrdersPager";
import { Badge, Dot, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  hasOrderFilters,
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
  const { campaign, q, status, view } = filters;
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
          <Button asChild variant={view === "attention" ? "default" : "outline"}>
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
        <Card size="sm">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Gift campaigns</h2>
            {viaPlatform ? null : (
              <Link href={`/app/stores/${storeId}/gifting`} className="text-sm font-medium text-brand-700 hover:underline">
                Gifting
              </Link>
            )}
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2">
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
                        ? "flex flex-col rounded-lg border border-brand-400 bg-brand-50 px-3 py-2 text-left text-xs"
                        : "flex flex-col rounded-lg border border-border px-3 py-2 text-left text-xs transition-colors hover:bg-muted"
                    }
                  >
                    <span className="font-semibold">
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
              <p className="mt-3 text-xs text-muted-foreground">
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
          </CardContent>
        </Card>
      ) : null}

      {/* One row: what to look for, which status, and the spreadsheet of it.
          The labels are read out but not drawn, so the controls line up. */}
      <form
        method="get"
        action={base}
        className="flex flex-wrap items-center gap-2 rounded-xl bg-card p-3 ring-1 ring-foreground/10"
      >
        {campaign ? <input type="hidden" name="campaign" value={campaign} /> : null}
        {view ? <input type="hidden" name="view" value={view} /> : null}

        <Label htmlFor="q" className="sr-only">
          Search
        </Label>
        <InputGroup className="w-full min-w-[12rem] flex-1 sm:w-auto">
          <InputGroupAddon>
            <SearchIcon aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            id="q"
            name="q"
            defaultValue={q}
            placeholder={viaPlatform ? "Order code or tracking number" : "Order code, customer or tracking number"}
          />
        </InputGroup>

        <Label htmlFor="status" className="sr-only">
          Status
        </Label>
        {/* "all" is the absence of a status filter, which the page parses back
            to no filter at all — a listbox item cannot carry an empty value. */}
        <Select name="status" defaultValue={status ?? "all"}>
          <SelectTrigger id="status" aria-label="Status" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((key) => (
              <SelectItem key={key} value={key}>
                {ORDER_STATUS_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button type="submit" variant="outline">
          Filter
        </Button>
        {hasOrderFilters(filters) ? (
          <Button asChild variant="ghost">
            <Link href={base} prefetch={false}>
              Clear
            </Link>
          </Button>
        ) : null}

        {exportHref ? (
          // A download, not a navigation: the browser saves the CSV the route
          // handler returns and leaves the page where it is.
          <Button asChild variant="outline" className="sm:ml-auto">
            <a href={exportHref} download>
              Download CSV
            </a>
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="sm:ml-auto"
            aria-disabled="true"
            disabled
            title="Only the store team who work the orders can download the shopper records."
          >
            Download CSV
          </Button>
        )}
      </form>

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
          <OrdersPager basePath={base} filters={filters} page={page} />
          <Card className="gap-0 overflow-hidden py-0">
            <Table
              containerClassName="overflow-y-auto sm:max-h-[70vh]"
              className="min-w-[52rem] text-left"
            >
              <TableHeader className="sticky top-0 z-20 bg-muted">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Order
                  </TableHead>
                  {viaPlatform ? null : (
                    <TableHead className="px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Customer
                    </TableHead>
                  )}
                  <TableHead className="px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Status
                  </TableHead>
                  <TableHead className="px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Fulfilment
                  </TableHead>
                  {viaPlatform ? null : (
                    <TableHead className="px-4 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Total
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.orders.map((order) => (
                  // The whole row opens the order: the code's link is stretched
                  // across it, and the links inside the row sit above it.
                  <TableRow key={order.id} className="relative align-top [&_a:not(.row-link)]:relative [&_a:not(.row-link)]:z-10">
                    <TableCell className="px-4 py-3">
                      <Link
                        href={`/app/stores/${storeId}/orders/${order.id}`}
                        className="row-link font-medium hover:underline after:absolute after:inset-0 after:content-['']"
                      >
                        {order.code}
                      </Link>
                      <p className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</p>
                    </TableCell>
                    {viaPlatform ? null : (
                      <TableCell className="px-4 py-3 whitespace-normal">
                        <p>{order.customer.name}</p>
                        <p className="text-xs text-muted-foreground">
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
                    <TableCell className="max-w-[22rem] px-4 py-3 whitespace-normal">
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
                        <p className="mt-1 text-xs text-rose-700">
                          {viaPlatform ? "Fulfilment exception raised" : order.fulfillment.exception}
                        </p>
                      ) : null}
                    </TableCell>
                    {viaPlatform ? null : (
                      <TableCell className="px-4 py-3 text-right font-medium tabular-nums">
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

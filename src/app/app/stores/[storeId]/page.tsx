import Link from "next/link";
import { Badge, Callout, DataList, EmptyState, ProgressBar, StatCard } from "@/components/ui";
import { StoreAdminPanel } from "./StoreAdminPanel";
import {
  agencyStoreAllowance,
  getAgency,
  getStorefront,
  listAudit,
  listOrders,
  listStoreProducts,
} from "@/lib/data";
import { setupProgress, storeMetrics } from "@/lib/metrics";
import { storeLimitMessage } from "@/lib/plans";
import { requireStoreAccess, roleCan } from "@/lib/session";
import { ORDER_STATUS_LABELS, SETUP_STEPS, THEMES } from "@/lib/types";
import { formatMoney, formatDate, relativeTime } from "@/lib/util";

const SETUP_LABELS: Record<(typeof SETUP_STEPS)[number], string> = {
  branding: "Logo and theme",
  localisation: "Language and currencies",
  support: "Support contacts",
  domain: "Custom domain",
  payments: "Stripe account",
  shipping: "Shipping carriers",
  tax: "Tax configuration",
};

export default async function StoreOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ denied?: string; limit?: string }>;
}) {
  const { storeId } = await params;
  const { denied, limit } = await searchParams;
  const { store, role } = await requireStoreAccess(storeId);

  const [orders, products, storefront, audit] = await Promise.all([
    listOrders(store.id),
    listStoreProducts(store.id),
    getStorefront(store.id),
    listAudit({ storeId: store.id }, 8),
  ]);

  // Only read after a restore was refused, so the usual visit stays two waves
  // of reads rather than three.
  const agency = limit ? await getAgency(store.agencyId) : null;
  const allowance = agency ? await agencyStoreAllowance(agency) : null;

  const metrics = storeMetrics(orders, products, store.defaultCurrency);
  const progress = setupProgress(store.setup);
  const recentOrders = orders.slice(0, 6);
  const theme = THEMES[store.theme];

  return (
    <div className="space-y-7">
      {denied ? (
        <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Your role ({role.replace("_", " ")}) does not include that screen.
        </p>
      ) : null}

      {allowance && agency ? (
        <Callout tone="amber" title={`${allowance.plan.name} plan limit reached`}>
          This store was not restored. {storeLimitMessage(allowance, agency.name)}{" "}
          <Link href="/pricing" className="font-medium underline">
            Compare plans
          </Link>
          .
        </Callout>
      ) : null}

      {store.status === "archived" ? (
        <Callout tone="slate" title="This store is archived">
          Its storefront is offline and no new orders can be taken. Records stay readable for reporting and
          audit. Restore it from the store settings below.
        </Callout>
      ) : null}

      {progress.pct < 100 ? (
        <section className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink">Finish setting up this store</h2>
              <p className="mt-1 text-sm text-muted">
                {progress.done} of {progress.total} steps complete. The storefront cannot take payments until
                Stripe and a carrier are connected.
              </p>
            </div>
            {roleCan(role, "store.settings") ? (
              <Link href={`/app/stores/${store.id}/setup`} className="btn-primary">
                Continue setup
              </Link>
            ) : null}
          </div>
          <div className="mt-4">
            <ProgressBar value={progress.pct} />
          </div>
          <ul className="mt-4 flex flex-wrap gap-2">
            {SETUP_STEPS.map((key) => (
              <li key={key}>
                <Badge tone={store.setup[key] ? "green" : "amber"}>
                  {store.setup[key] ? "✓" : "•"} {SETUP_LABELS[key]}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Sales, last 30 days"
          value={formatMoney(metrics.last30Sales, store.defaultCurrency)}
          sub={`${metrics.last30Orders} orders`}
        />
        <StatCard
          label="Lifetime sales"
          value={formatMoney(metrics.grossSales, store.defaultCurrency)}
          sub={`${metrics.paidOrders} paid orders`}
        />
        <StatCard
          label="Published products"
          value={String(metrics.publishedProducts)}
          sub={`${metrics.draftProducts} in draft or review`}
        />
        <StatCard
          label="Needs attention"
          value={String(metrics.awaitingAction)}
          tone={metrics.awaitingAction > 0 ? "amber" : "green"}
          sub={`${metrics.exceptions} exceptions · ${metrics.manualRouting} manual routing`}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card min-w-0 p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-ink">Recent orders</h2>
            <Link href={`/app/stores/${store.id}/orders`} className="text-sm font-medium text-brand-700 hover:underline">
              All orders
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="No orders yet"
                description="Once the storefront is published and a shopper checks out, orders appear here with their production and delivery status."
              />
            </div>
          ) : (
            <div className="mt-4 relative overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-sm">
                <thead className="text-xs font-semibold uppercase tracking-wide text-muted">
                  <tr>
                    <th scope="col" className="py-2 pr-3">Order</th>
                    <th scope="col" className="py-2 pr-3">Placed</th>
                    <th scope="col" className="py-2 pr-3">Status</th>
                    <th scope="col" className="py-2 pr-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {recentOrders.map((order) => (
                    <tr key={order.id}>
                      <td className="py-2.5 pr-3">
                        <Link
                          href={`/app/stores/${store.id}/orders/${order.id}`}
                          className="font-medium text-ink hover:underline"
                        >
                          {order.code}
                        </Link>
                        <span className="block text-xs text-muted">{order.customer.name}</span>
                      </td>
                      <td className="py-2.5 pr-3 text-muted">{formatDate(order.createdAt)}</td>
                      <td className="py-2.5 pr-3">
                        <Badge
                          tone={
                            order.status === "exception"
                              ? "rose"
                              : order.status === "delivered"
                                ? "green"
                                : order.status === "cancelled"
                                  ? "slate"
                                  : "brand"
                          }
                        >
                          {ORDER_STATUS_LABELS[order.status]}
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-3 text-right font-medium tabular-nums text-ink">
                        {formatMoney(order.total, order.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="space-y-6">
          <div className="card p-5">
            <h2 className="text-base font-semibold text-ink">Fulfilment</h2>
            <DataList
              rows={[
                { label: ORDER_STATUS_LABELS.in_production, value: metrics.inProduction },
                { label: ORDER_STATUS_LABELS.shipped, value: metrics.shipped },
                { label: ORDER_STATUS_LABELS.delivered, value: metrics.delivered },
                { label: ORDER_STATUS_LABELS.cancelled, value: metrics.cancelled },
                {
                  label: ORDER_STATUS_LABELS.exception,
                  value:
                    metrics.exceptions > 0 ? (
                      <span className="text-rose-700">{metrics.exceptions}</span>
                    ) : (
                      0
                    ),
                },
                { label: "Refunded", value: formatMoney(metrics.refunded, store.defaultCurrency) },
              ]}
            />
          </div>

          <div className="card p-5">
            <h2 className="text-base font-semibold text-ink">Storefront</h2>
            <p className="mt-2 text-sm text-muted">
              {storefront?.published
                ? `Published ${formatDate(storefront.publishedAt ?? storefront.draftUpdatedAt)} by ${storefront.publishedBy ?? "the store team"}.`
                : "Not published yet — the storefront shows a placeholder until you publish a layout."}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <span aria-hidden className="h-5 w-5 rounded border border-line" style={{ background: theme.accent }} />
              <span className="text-sm text-inksoft">{theme.name} theme</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {roleCan(role, "store.storefront") ? (
                <Link href={`/app/stores/${store.id}/storefront`} className="btn-secondary btn-sm">
                  Open editor
                </Link>
              ) : null}
              <Link
                href={`/s/${store.slug}`}
                target="_blank"
                rel="noreferrer"
                className="btn-ghost btn-sm"
              >
                View storefront ↗
              </Link>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-base font-semibold text-ink">Product performance</h2>
          {metrics.topProducts.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No paid orders yet, so there is nothing to rank.</p>
          ) : (
            <ol className="mt-3 divide-y divide-line text-sm">
              {metrics.topProducts.map((product) => (
                <li key={product.name} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0 truncate text-ink">{product.name}</span>
                  <span className="shrink-0 text-muted">
                    {product.units} units ·{" "}
                    <span className="font-medium text-ink tabular-nums">
                      {formatMoney(product.revenue, store.defaultCurrency)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-ink">Recent activity</h2>
            <Link href={`/app/stores/${store.id}/activity`} className="text-sm font-medium text-brand-700 hover:underline">
              Full history
            </Link>
          </div>
          {audit.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nothing recorded for this store yet.</p>
          ) : (
            <ol className="mt-3 divide-y divide-line text-sm">
              {audit.map((entry) => (
                <li key={entry.id} className="py-2.5">
                  <p className="text-ink">{entry.summary}</p>
                  <p className="text-xs text-muted">
                    {entry.actorName} · {relativeTime(entry.at)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {roleCan(role, "store.settings") ? <StoreAdminPanel store={store} /> : null}
    </div>
  );
}

import Link from "next/link";
import { setStoreStatus } from "@/app/actions/stores";
import { AppHeader } from "@/components/AppHeader";
import { Badge, EmptyState, PageHeader, ProgressBar, StatCard } from "@/components/ui";
import { getAgency, listAudit, listOrders, listStoreProducts } from "@/lib/data";
import { setupProgress, storeMetrics } from "@/lib/metrics";
import { accessibleStores, requireUser } from "@/lib/session";
import { STORE_ROLE_LABELS, THEMES } from "@/lib/types";
import { formatMoney, relativeTime } from "@/lib/util";

export default async function AgencyDashboard({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const { denied } = await searchParams;
  const user = await requireUser();
  const stores = await accessibleStores(user);
  const agency = user.agencyId ? await getAgency(user.agencyId) : null;

  const rows = await Promise.all(
    stores.map(async ({ store, role }) => {
      const [orders, products] = await Promise.all([listOrders(store.id), listStoreProducts(store.id)]);
      return { store, role, metrics: storeMetrics(orders, products, store.defaultCurrency) };
    }),
  );

  const active = rows.filter((r) => r.store.status === "active");
  const archived = rows.filter((r) => r.store.status === "archived");
  const audit = await listAudit(
    user.platformRole === "platform_admin" ? {} : { agencyId: user.agencyId ?? "__none__" },
    12,
  );

  const totalOrders = active.reduce((sum, r) => sum + r.metrics.orderCount, 0);
  const openIssues = active.reduce((sum, r) => sum + r.metrics.exceptions + r.metrics.manualRouting, 0);
  const publishedProducts = active.reduce((sum, r) => sum + r.metrics.publishedProducts, 0);

  return (
    <>
      <AppHeader user={user} stores={stores} />
      <div className="mx-auto w-full max-w-[92rem] flex-1 px-4 py-7 sm:px-6">
        <PageHeader
          title={`Good to see you, ${user.name.split(" ")[0]}`}
          description={
            <>
              {agency ? `${agency.name} · ` : ""}
              {active.length} active {active.length === 1 ? "store" : "stores"}
              {archived.length ? `, ${archived.length} archived` : ""}. Figures are shown per store.
            </>
          }
          actions={
            user.platformRole === "agency_admin" || user.platformRole === "platform_admin" ? (
              <Link href="/app/stores/new" className="btn-primary">
                Create a client store
              </Link>
            ) : null
          }
        />

        {denied ? (
          <p role="alert" className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {denied === "1"
              ? "You do not have access to that store. Ask an agency administrator for an invitation."
              : "Your role does not allow that screen. Ask a store administrator if you need access."}
          </p>
        ) : null}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Active stores" value={String(active.length)} sub={`${archived.length} archived`} />
          <StatCard label="Orders across stores" value={String(totalOrders)} sub="Counted per store, never merged" />
          <StatCard label="Published products" value={String(publishedProducts)} sub="Live on client storefronts" />
          <StatCard
            label="Needs attention"
            value={String(openIssues)}
            sub="Exceptions and manual routing"
            tone={openIssues > 0 ? "amber" : "green"}
          />
        </div>

        <section className="mt-9">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-ink">Client stores</h2>
            <p className="text-xs text-muted">Sales shown in each store&rsquo;s own currency</p>
          </div>

          {active.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="No stores yet"
                description="Create the first client store to set up branding, payments, shipping and a catalog. It takes about five minutes."
                action={
                  <Link href="/app/stores/new" className="btn-primary">
                    Create a client store
                  </Link>
                }
              />
            </div>
          ) : (
            <ul className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {active.map(({ store, role, metrics }) => {
                const progress = setupProgress(store.setup as unknown as Record<string, boolean>);
                const theme = THEMES[store.theme];
                return (
                  <li key={store.id} className="card flex flex-col p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/app/stores/${store.id}`}
                          className="text-base font-semibold text-ink hover:underline"
                        >
                          {store.name}
                        </Link>
                        <p className="truncate text-sm text-muted">{store.clientName}</p>
                      </div>
                      <span
                        aria-hidden
                        className="h-8 w-8 shrink-0 rounded-lg border border-line"
                        style={{ background: theme.accent }}
                      />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Badge tone="neutral">{STORE_ROLE_LABELS[role]}</Badge>
                      <Badge tone={store.stripe.connected ? "green" : "amber"}>
                        {store.stripe.connected ? "Stripe connected" : "Stripe pending"}
                      </Badge>
                      {store.customDomain ? (
                        <Badge tone={store.domainStatus === "verified" ? "green" : "amber"}>
                          {store.customDomain}
                        </Badge>
                      ) : null}
                    </div>

                    <dl className="mt-4 grid grid-cols-3 gap-3 border-y border-line py-3 text-sm">
                      <div>
                        <dt className="text-xs text-muted">Sales, 30 days</dt>
                        <dd className="mt-0.5 font-semibold tabular-nums text-ink">
                          {formatMoney(metrics.last30Sales, store.defaultCurrency)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted">Orders</dt>
                        <dd className="mt-0.5 font-semibold tabular-nums text-ink">{metrics.orderCount}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted">Products</dt>
                        <dd className="mt-0.5 font-semibold tabular-nums text-ink">
                          {metrics.publishedProducts}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                      <span className="chip">{metrics.inProduction} in production</span>
                      <span className="chip">{metrics.shipped} shipped</span>
                      <span className="chip">{metrics.delivered} delivered</span>
                      {metrics.exceptions > 0 ? (
                        <Badge tone="rose">{metrics.exceptions} exception{metrics.exceptions === 1 ? "" : "s"}</Badge>
                      ) : null}
                      {metrics.manualRouting > 0 ? (
                        <Badge tone="amber">{metrics.manualRouting} manual</Badge>
                      ) : null}
                    </div>

                    {progress.pct < 100 ? (
                      <div className="mt-4">
                        <ProgressBar value={progress.pct} label={`Setup ${progress.done}/${progress.total}`} />
                      </div>
                    ) : null}

                    <div className="mt-auto flex flex-wrap gap-2 pt-4">
                      <Link href={`/app/stores/${store.id}`} className="btn-secondary btn-sm">
                        Open
                      </Link>
                      <Link href={`/app/stores/${store.id}/orders`} className="btn-ghost btn-sm">
                        Orders
                      </Link>
                      <Link
                        href={`/s/${store.slug}`}
                        className="btn-ghost btn-sm"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Storefront ↗
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {archived.length > 0 ? (
          <section className="mt-9">
            <h2 className="text-base font-semibold text-ink">Archived stores</h2>
            <p className="mt-1 text-sm text-muted">
              Archived stores keep their records for reporting and audit. Their storefronts are offline.
            </p>
            <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
              {archived.map(({ store, metrics }) => (
                <li key={store.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{store.name}</p>
                    <p className="truncate text-xs text-muted">
                      {store.clientName} · {metrics.orderCount} historic orders ·{" "}
                      {formatMoney(metrics.grossSales, store.defaultCurrency)} lifetime
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/app/stores/${store.id}`} className="btn-ghost btn-sm">
                      View records
                    </Link>
                    <form action={setStoreStatus}>
                      <input type="hidden" name="storeId" value={store.id} />
                      <input type="hidden" name="status" value="active" />
                      <button type="submit" className="btn-secondary btn-sm">
                        Restore
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-9 pb-4">
          <h2 className="text-base font-semibold text-ink">Recent activity</h2>
          {audit.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nothing recorded yet.</p>
          ) : (
            <ol className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
              {audit.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5">
                  <span className="text-sm text-ink">{entry.summary}</span>
                  <span className="text-xs text-muted">
                    {entry.actorName} · {relativeTime(entry.at)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}

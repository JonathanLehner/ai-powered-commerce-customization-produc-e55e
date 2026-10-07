import Link from "next/link";
import { ArchivedStores } from "@/app/app/ArchivedStores";
import { PlatformWorkspace } from "@/app/app/PlatformWorkspace";
import { StoreCard } from "@/app/app/StoreCard";
import { setStoreStatus } from "@/app/actions/stores";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState, PageHeader, StatCard } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { auditRunSummary, recentAuditReadSize, recentAuditRuns } from "@/lib/audit-log";
import { getAgency, listAudit, listOrdersByStore, listStoreProductsByStore } from "@/lib/data";
import { storeMetrics } from "@/lib/metrics";
import { storeAllowance, storeUsageLabel } from "@/lib/plans";
import { accessibleStores, requireUser } from "@/lib/session";
import { storeAccessLabel } from "@/lib/types";
import { formatMoney, relativeTime } from "@/lib/util";

/** Rows the "Recent activity" panel has room for, once repeats are collapsed. */
const ACTIVITY_ROWS = 12;

export default async function AgencyDashboard({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const { denied } = await searchParams;
  const user = await requireUser();
  // A platform administrator runs no store, so they get the oversight view:
  // grouped by agency, nothing added up across them.
  if (user.platformRole === "platform_admin") return <PlatformWorkspace user={user} denied={denied} />;

  // The store list, the agency and the activity feed only depend on the user,
  // so they are read together instead of one round trip after another.
  const [stores, agency, audit] = await Promise.all([
    accessibleStores(user),
    user.agencyId ? getAgency(user.agencyId) : Promise.resolve(null),
    listAudit({ agencyId: user.agencyId ?? "__none__" }, recentAuditReadSize(ACTIVITY_ROWS)),
  ]);

  // Repeats are one row here; the platform log and each store's Activity page
  // still list every record.
  const activity = recentAuditRuns(audit, ACTIVITY_ROWS);

  // Orders and store products for every store on the page, one read each.
  // Read per store it was two round trips times the store count — fifty fetches
  // for an agency with twenty-five clients — and the platform runs only about
  // six at a time, so they queued and the page took twenty seconds to render.
  const storeIds = stores.map(({ store }) => store.id);
  const [ordersByStore, productsByStore] = await Promise.all([
    listOrdersByStore(storeIds),
    listStoreProductsByStore(storeIds),
  ]);

  const rows = stores.map(({ store, role, viaPlatform }) => ({
    store,
    role,
    viaPlatform,
    metrics: storeMetrics(
      ordersByStore.get(store.id) ?? [],
      productsByStore.get(store.id) ?? [],
      store.defaultCurrency,
    ),
  }));

  const active = rows.filter((r) => r.store.status === "active");
  const archived = rows.filter((r) => r.store.status === "archived");

  const planAllowance = agency && user.platformRole === "agency_admin" ? storeAllowance(agency.plan, active.length) : null;
  const planUsage = planAllowance
    ? `${planAllowance.plan.name} plan · ${storeUsageLabel(planAllowance)}${
        planAllowance.atLimit ? " · limit reached" : ""
      }`
    : null;

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
              {/* The agency's own admin sees every store it runs, so the count on
                  this page is the one the plan limit is applied to. */}
              {planUsage ? <span className="mt-0.5 block">{planUsage}</span> : null}
            </>
          }
          actions={
            user.platformRole === "agency_admin" ? (
              <Button asChild>
                <Link href="/app/stores/new">Create a client store</Link>
              </Button>
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
            <h2 className="font-heading text-base font-medium text-foreground">Client stores</h2>
            <p className="text-xs text-muted-foreground">Sales shown in each store&rsquo;s own currency</p>
          </div>

          {active.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="No stores yet"
                description="Create the first client store to set up branding, payments, shipping and a catalog. It takes about five minutes."
                action={
                  <Button asChild>
                    <Link href="/app/stores/new">Create a client store</Link>
                  </Button>
                }
              />
            </div>
          ) : (
            <ul className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {active.map(({ store, role, viaPlatform, metrics }) => (
                <li key={store.id}>
                  <StoreCard
                    store={store}
                    subtitle={store.clientName}
                    badge={{ label: storeAccessLabel(role, viaPlatform), tone: "neutral" }}
                    stats={[
                      {
                        label: "Sales, 30 days",
                        value: formatMoney(metrics.last30Sales, store.defaultCurrency),
                      },
                      { label: "Orders", value: String(metrics.orderCount) },
                      { label: "Products", value: String(metrics.publishedProducts) },
                    ]}
                    metrics={metrics}
                    withOrders
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        {archived.length > 0 ? (
          <ArchivedStores count={archived.length}>
            <p className="mt-1 text-sm text-muted-foreground">
              Archived stores keep their records for reporting and audit. Their storefronts are offline.
            </p>
            <Card className="mt-4 py-0">
              <ul className="divide-y divide-border">
                {archived.map(({ store, metrics }) => (
                  <li
                    key={store.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{store.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {store.clientName} · {metrics.orderCount} historic orders ·{" "}
                        {formatMoney(metrics.grossSales, store.defaultCurrency)} lifetime
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/app/stores/${store.id}`}>View records</Link>
                      </Button>
                      <form action={setStoreStatus}>
                        <input type="hidden" name="storeId" value={store.id} />
                        <input type="hidden" name="status" value="active" />
                        <Button type="submit" variant="outline" size="sm">
                          Restore
                        </Button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </ArchivedStores>
        ) : null}

        <section className="mt-9 pb-4">
          <h2 className="font-heading text-base font-medium text-foreground">Recent activity</h2>
          {activity.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <Card className="mt-4 py-0">
              <ol className="divide-y divide-border">
                {activity.map((run) => (
                  <li
                    key={run.entry.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5"
                  >
                    <span className="text-sm text-foreground">{auditRunSummary(run)}</span>
                    <span className="text-xs text-muted-foreground">
                      {run.entry.actorName} · {relativeTime(run.entry.at)}
                    </span>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </section>
      </div>
    </>
  );
}

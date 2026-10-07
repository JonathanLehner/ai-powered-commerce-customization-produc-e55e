import { CreditCardIcon, GlobeIcon } from "lucide-react";
import Link from "next/link";
import { ArchivedStores } from "@/app/app/ArchivedStores";
import { PlatformWorkspace } from "@/app/app/PlatformWorkspace";
import { setStoreStatus } from "@/app/actions/stores";
import { AppHeader } from "@/components/AppHeader";
import { Badge, EmptyState, PageHeader, ProgressBar, StatCard } from "@/components/ui";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { auditRunSummary, recentAuditReadSize, recentAuditRuns } from "@/lib/audit-log";
import { getAgency, listAudit, listOrdersByStore, listStoreProductsByStore } from "@/lib/data";
import { setupProgress, storeMetrics } from "@/lib/metrics";
import { storeAllowance, storeUsageLabel } from "@/lib/plans";
import { accessibleStores, requireUser } from "@/lib/session";
import { storeAccessLabel, THEMES } from "@/lib/types";
import { formatMoney, relativeTime } from "@/lib/util";

/** Rows the "Recent activity" panel has room for, once repeats are collapsed. */
const ACTIVITY_ROWS = 12;

/** Up to two letters for the store's avatar, which carries its theme colour. */
function storeInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

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
            <h2 className="text-base font-semibold text-ink">Client stores</h2>
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
              {active.map(({ store, role, viaPlatform, metrics }) => {
                const progress = setupProgress(store.setup);
                const theme = THEMES[store.theme];
                return (
                  <li key={store.id}>
                    <Card className="h-full">
                      <CardHeader className="flex flex-row items-start gap-3">
                        {/* The store's own theme colour, so a client is
                            recognised before its name is read. */}
                        <Avatar size="lg" aria-hidden>
                          <AvatarFallback
                            style={{ backgroundColor: theme.accent }}
                            className="text-xs font-semibold text-white"
                          >
                            {storeInitials(store.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <CardTitle className="truncate">
                            <Link
                              href={`/app/stores/${store.id}`}
                              className="font-semibold hover:underline"
                            >
                              {store.name}
                            </Link>
                          </CardTitle>
                          <p className="truncate text-sm text-muted-foreground">{store.clientName}</p>
                        </div>
                        <Badge tone="neutral" className="shrink-0">
                          {storeAccessLabel(role, viaPlatform)}
                        </Badge>
                      </CardHeader>

                      <CardContent className="flex flex-1 flex-col gap-4">
                        <div className="space-y-1.5 text-xs text-muted-foreground">
                          <p className="flex items-center gap-1.5">
                            <CreditCardIcon
                              aria-hidden
                              className={
                                store.stripe.connected
                                  ? "size-3.5 shrink-0 text-emerald-600"
                                  : "size-3.5 shrink-0 text-amber-600"
                              }
                            />
                            {store.stripe.connected ? "Stripe connected" : "Stripe pending"}
                          </p>
                          {store.customDomain ? (
                            <p className="flex items-center gap-1.5">
                              <GlobeIcon
                                aria-hidden
                                className={
                                  store.domainStatus === "verified"
                                    ? "size-3.5 shrink-0 text-emerald-600"
                                    : "size-3.5 shrink-0 text-amber-600"
                                }
                              />
                              <span className="truncate">{store.customDomain}</span>
                            </p>
                          ) : null}
                        </div>

                        <dl className="grid grid-cols-3 gap-3 border-y border-border py-3 text-sm">
                          <div>
                            <dt className="text-xs text-muted-foreground">Sales, 30 days</dt>
                            <dd className="mt-0.5 font-semibold tabular-nums">
                              {formatMoney(metrics.last30Sales, store.defaultCurrency)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">Orders</dt>
                            <dd className="mt-0.5 font-semibold tabular-nums">{metrics.orderCount}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">Products</dt>
                            <dd className="mt-0.5 font-semibold tabular-nums">
                              {metrics.publishedProducts}
                            </dd>
                          </div>
                        </dl>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <p className="text-xs text-muted-foreground">
                            {metrics.inProduction} in production · {metrics.shipped} shipped ·{" "}
                            {metrics.delivered} delivered
                          </p>
                          {metrics.exceptions > 0 ? (
                            <Badge tone="rose">
                              {metrics.exceptions} exception{metrics.exceptions === 1 ? "" : "s"}
                            </Badge>
                          ) : null}
                          {metrics.manualRouting > 0 ? (
                            <Badge tone="amber">{metrics.manualRouting} manual</Badge>
                          ) : null}
                        </div>

                        {progress.pct < 100 ? (
                          <div className="mt-auto">
                            <ProgressBar value={progress.pct} label={`Setup ${progress.done}/${progress.total}`} />
                          </div>
                        ) : null}
                      </CardContent>

                      <CardFooter className="gap-2">
                        <Button asChild size="sm">
                          <Link href={`/app/stores/${store.id}`}>Open</Link>
                        </Button>
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/app/stores/${store.id}/orders`}>Orders</Link>
                        </Button>
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/s/${store.slug}`} target="_blank" rel="noreferrer">
                            Storefront ↗
                          </Link>
                        </Button>
                      </CardFooter>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {archived.length > 0 ? (
          <ArchivedStores count={archived.length}>
            <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
              {archived.map(({ store, metrics }) => (
                <li key={store.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{store.name}</p>
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
          </ArchivedStores>
        ) : null}

        <section className="mt-9 pb-4">
          <h2 className="text-base font-semibold text-ink">Recent activity</h2>
          {activity.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <ol className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
              {activity.map((run) => (
                <li key={run.entry.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5">
                  <span className="text-sm text-ink">{auditRunSummary(run)}</span>
                  <span className="text-xs text-muted-foreground">
                    {run.entry.actorName} · {relativeTime(run.entry.at)}
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

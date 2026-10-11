import { CreditCardIcon, GlobeIcon } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";
import { ArchivedStores } from "@/app/app/ArchivedStores";
import { PlatformWorkspace } from "@/app/app/PlatformWorkspace";
import { RevenueSparkline } from "@/app/app/RevenueSparkline";
import { setStoreStatus } from "@/app/actions/stores";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState, PageHeader, ProgressBar, StatCard } from "@/components/ui";
import { formatAgo, formatMinorUnits } from "@/i18n/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { loadSparklines } from "@/lib/analytics-data";
import { recentAuditReadSize, recentAuditRuns } from "@/lib/audit-log";
import { getAgency, listAudit, listOrdersByStore, listStoreProductsByStore } from "@/lib/data";
import { setupProgress, storeMetrics } from "@/lib/metrics";
import { storeAllowance } from "@/lib/plans";
import { accessibleStores, requireUser } from "@/lib/session";
import { THEMES } from "@/lib/types";

/** Rows the "Recent activity" panel has room for, once repeats are collapsed. */
const ACTIVITY_ROWS = 12;

/** The store's own mark: its theme colour, with the initials of its name. */
function storeInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
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
  const [t, shell, roles, format] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("shell"),
    getTranslations("roles"),
    getFormatter(),
  ]);
  const now = new Date();
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
  // The sparklines come from the same aggregation as each store's Analytics
  // page, for every live store in one read.
  const [ordersByStore, productsByStore, sparklines] = await Promise.all([
    listOrdersByStore(storeIds),
    listStoreProductsByStore(storeIds),
    loadSparklines(
      stores.filter(({ store }) => store.status === "active").map(({ store }) => store),
      now,
    ),
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
    ? t("planUsage", {
        plan: planAllowance.plan.name,
        usage:
          planAllowance.limit === null
            ? t("usageUnlimited", { used: planAllowance.used })
            : t("usageLimited", { used: planAllowance.used, limit: planAllowance.limit }),
      }) + (planAllowance.atLimit ? t("limitReached") : "")
    : null;
  const money = (minor: number, currency: string) => formatMinorUnits(format, minor, currency);

  const totalOrders = active.reduce((sum, r) => sum + r.metrics.orderCount, 0);
  const openIssues = active.reduce((sum, r) => sum + r.metrics.exceptions + r.metrics.manualRouting, 0);
  const publishedProducts = active.reduce((sum, r) => sum + r.metrics.publishedProducts, 0);

  return (
    <>
      <AppHeader user={user} stores={stores} />
      <div className="mx-auto w-full max-w-[92rem] flex-1 px-4 py-7 sm:px-6">
        <PageHeader
          title={t("title")}
          description={
            <>
              {agency ? `${agency.name} · ` : ""}
              {t("activeStores", { count: active.length })}
              {archived.length ? t("archivedSuffix", { count: archived.length }) : ""}
              {/* The agency's own admin sees every store it runs, so the count on
                  this page is the one the plan limit is applied to. */}
              {planUsage ? <span className="mt-0.5 block">{planUsage}</span> : null}
            </>
          }
          actions={
            user.platformRole === "agency_admin" ? (
              <Button asChild>
                <Link href="/app/stores/new">{shell("createStore")}</Link>
              </Button>
            ) : null
          }
        />

        {denied ? (
          <p role="alert" className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {denied === "1" ? t("deniedStore") : t("deniedPage")}
          </p>
        ) : null}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t("statActiveStores")}
            value={format.number(active.length)}
            sub={t("statArchived", { count: archived.length })}
          />
          <StatCard label={t("statOrders")} value={format.number(totalOrders)} />
          <StatCard label={t("statPublished")} value={format.number(publishedProducts)} />
          <StatCard
            label={t("statAttention")}
            value={format.number(openIssues)}
            sub={t("statAttentionSub")}
            tone={openIssues > 0 ? "amber" : "green"}
          />
        </div>

        <section className="mt-9">
          <h2 className="text-base font-semibold text-foreground">{t("clientStores")}</h2>

          {active.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title={t("emptyTitle")}
                description={t("emptyBody")}
                action={
                  <Button asChild>
                    <Link href="/app/stores/new">{shell("createStore")}</Link>
                  </Button>
                }
              />
            </div>
          ) : (
            <ul className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {active.map(({ store, role, viaPlatform, metrics }) => {
                const progress = setupProgress(store.setup);
                const revenue = sparklines.get(store.id) ?? [];
                const theme = THEMES[store.theme];
                return (
                  <li key={store.id}>
                    <Card className="h-full">
                      <CardHeader>
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Avatar>
                            {/* The store's own accent, so a card is recognised
                                before its name is read. */}
                            <AvatarFallback
                              className="text-xs font-semibold text-white"
                              style={{ background: theme.accent }}
                            >
                              {storeInitials(store.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <CardTitle className="truncate">
                              <Link href={`/app/stores/${store.id}`} className="hover:underline">
                                {store.name}
                              </Link>
                            </CardTitle>
                            <p className="truncate text-sm text-muted-foreground">{store.clientName}</p>
                          </div>
                        </div>
                        <CardAction>
                          <Badge variant={viaPlatform ? "secondary" : "outline"}>
                            {viaPlatform ? roles("platformAccess") : roles(role)}
                          </Badge>
                        </CardAction>
                      </CardHeader>

                      <CardContent className="space-y-3">
                        <ul className="space-y-1.5 text-sm text-muted-foreground">
                          <li className="flex items-center gap-2">
                            <CreditCardIcon
                              aria-hidden
                              className={
                                store.stripe.connected
                                  ? "size-4 text-emerald-600"
                                  : "size-4 text-amber-600"
                              }
                            />
                            {store.stripe.connected ? t("stripeConnected") : t("stripePending")}
                          </li>
                          {store.customDomain ? (
                            <li className="flex items-center gap-2">
                              <GlobeIcon
                                aria-hidden
                                className={
                                  store.domainStatus === "verified"
                                    ? "size-4 text-emerald-600"
                                    : "size-4 text-amber-600"
                                }
                              />
                              <span className="truncate">{store.customDomain}</span>
                            </li>
                          ) : null}
                        </ul>

                        <div className="space-y-2 border-y border-border py-3">
                        <dl className="grid grid-cols-3 gap-3 text-sm">
                          <div>
                            <dt className="text-xs text-muted-foreground">{t("revenue30")}</dt>
                            <dd className="mt-0.5 font-semibold tabular-nums text-foreground">
                              {money(revenue.reduce((sum, day) => sum + day, 0), store.defaultCurrency)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">{t("orders")}</dt>
                            <dd className="mt-0.5 font-semibold tabular-nums text-foreground">
                              {format.number(metrics.orderCount)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">{t("products")}</dt>
                            <dd className="mt-0.5 font-semibold tabular-nums text-foreground">
                              {format.number(metrics.publishedProducts)}
                            </dd>
                          </div>
                        </dl>
                        <RevenueSparkline values={revenue} label={t("revenue30")} />
                        </div>

                        <p className="text-xs text-muted-foreground">
                          {t("inProduction", { count: metrics.inProduction })} ·{" "}
                          {t("shipped", { count: metrics.shipped })} · {t("delivered", { count: metrics.delivered })}
                          {metrics.exceptions > 0 ? (
                            <span className="text-destructive">
                              {" · "}
                              {t("exceptions", { count: metrics.exceptions })}
                            </span>
                          ) : null}
                          {metrics.manualRouting > 0 ? (
                            <span className="text-amber-700">
                              {" · "}
                              {t("manual", { count: metrics.manualRouting })}
                            </span>
                          ) : null}
                        </p>

                        {progress.pct < 100 ? (
                          <ProgressBar value={progress.pct} label={t("setup", { done: progress.done, total: progress.total })} />
                        ) : null}
                      </CardContent>

                      <CardFooter className="mt-auto gap-2">
                        <Button asChild size="sm">
                          <Link href={`/app/stores/${store.id}`}>{t("open")}</Link>
                        </Button>
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/app/stores/${store.id}/orders`}>{t("orders")}</Link>
                        </Button>
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/s/${store.slug}`} target="_blank" rel="noreferrer">
                            {t("storefront")}
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
          <section className="mt-9">
            <h2 className="text-base font-semibold text-foreground">{t("archivedStores")}</h2>
            {/* Collapsed by default: the live stores above are what the page is
                for, and an agency that has run for a while has more archived
                than active. */}
            <ArchivedStores count={archived.length}>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                {archived.map(({ store, metrics }) => (
                  <li key={store.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{store.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {t("archivedRow", {
                          client: store.clientName,
                          count: metrics.orderCount,
                          amount: money(metrics.grossSales, store.defaultCurrency),
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/app/stores/${store.id}`}>{t("viewRecords")}</Link>
                      </Button>
                      <form action={setStoreStatus}>
                        <input type="hidden" name="storeId" value={store.id} />
                        <input type="hidden" name="status" value="active" />
                        <Button type="submit" size="sm" variant="outline">
                          {t("restore")}
                        </Button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </ArchivedStores>
          </section>
        ) : null}

        <section className="mt-9 pb-4">
          <h2 className="text-base font-semibold text-foreground">{t("recentActivity")}</h2>
          {activity.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t("nothingYet")}</p>
          ) : (
            <ol className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {activity.map((run) => (
                <li key={run.entry.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5">
                  <span className="text-sm text-foreground">
                    {run.count > 1 ? t("repeated", { summary: run.entry.summary, count: run.count }) : run.entry.summary}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {run.entry.actorName} · {formatAgo(format, run.entry.at, now)}
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

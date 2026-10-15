import { CreditCardIcon, GlobeIcon } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";
import { ArchivedStores } from "@/app/app/ArchivedStores";
import { PlatformWorkspace } from "@/app/app/PlatformWorkspace";
import { RevenueSparkline } from "@/app/app/RevenueSparkline";
import { AppHeader } from "@/components/AppHeader";
import { ClientMessages } from "@/components/ClientMessages";
import { AuditSummary, SUMMARY_SLOT } from "@/components/AuditSummary";
import { RangeControls } from "@/components/RangeControls";
import { EmptyState, PageHeader, ProgressBar, StatCard } from "@/components/ui";
import { attentionSummary } from "@/i18n/attention-copy";
import { formatAgo, formatMinorUnits } from "@/i18n/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { parseRange, rangeQuery } from "@/lib/analytics";
import { loadSparklines } from "@/lib/analytics-data";
import { recentAuditReadSize, recentAuditRuns } from "@/lib/audit-log";
import { listAudit, storesWithShippingRates, storeTemplateIds } from "@/lib/data";
import { addBreakdowns } from "@/lib/attention";
import { setupProgress, setupStatus } from "@/lib/metrics";
import { loadStoreMetrics } from "@/lib/metrics-data";
import { storeAllowance } from "@/lib/plans";
import { redirect } from "next/navigation";
import { billingPending } from "@/lib/billing";
import { accessibleStores, getAgencyForRender, requireUser, roleCan, type Capability } from "@/lib/session";
import { THEMES } from "@/lib/types";
import { paymentsReady } from "@/lib/payment-mode";

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
  searchParams: Promise<{ denied?: string; range?: string; from?: string; to?: string }>;
}) {
  const query = await searchParams;
  const { denied } = query;
  const user = await requireUser();
  const [t, attention, shell, roles, format] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("attention"),
    getTranslations("shell"),
    getTranslations("roles"),
    getFormatter(),
  ]);
  const now = new Date();
  // Every card reports the same period, in the address so a comparison can be shared.
  const range = parseRange(query, now);
  // A platform administrator runs no store, so they get the oversight view:
  // grouped by agency, nothing added up across them.
  if (user.platformRole === "platform_admin") {
    return (
      <ClientMessages section="dashboard">
        <PlatformWorkspace user={user} denied={denied} />
      </ClientMessages>
    );
  }

  // The store list, the agency and the activity feed only depend on the user,
  // so they are read together instead of one round trip after another.
  const [stores, agency, audit] = await Promise.all([
    accessibleStores(user),
    user.agencyId ? getAgencyForRender(user.agencyId) : Promise.resolve(null),
    listAudit({ agencyId: user.agencyId ?? "__none__" }, recentAuditReadSize(ACTIVITY_ROWS)),
  ]);
  if (billingPending(agency)) redirect("/app/billing");

  // Repeats are one row here; the platform log and each store's Activity page
  // still list every record.
  const activity = recentAuditRuns(audit, ACTIVITY_ROWS);
  // Each entry links into its own store, as far as the user's role there goes.
  const roleIn = new Map(stores.map(({ store, role }) => [store.id, role]));
  const canIn = (storeId: string | null) => (capability: Capability) => {
    const role = storeId ? roleIn.get(storeId) : undefined;
    return role ? roleCan(role, capability) : false;
  };

  // Every store's order and product figures, added up in the database in one
  // read each rather than read order by order into the Worker. The sparklines
  // come from the same aggregation as each store's Analytics page, for every
  // live store in one read.
  const [metricsByStore, sparklines, shipsWithRates, templateIds] = await Promise.all([
    loadStoreMetrics(stores.map(({ store }) => store)),
    loadSparklines(
      stores.filter(({ store }) => store.status === "active").map(({ store }) => store),
      range,
    ),
    storesWithShippingRates(stores.map(({ store }) => store.id)),
    storeTemplateIds(stores.map(({ store }) => store.id)),
  ]);

  const rows = stores.map(({ store, role, viaPlatform }) => ({
    store,
    role,
    viaPlatform,
    metrics: metricsByStore.get(store.id)!,
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
  const day = (value: string) => format.dateTime(new Date(`${value}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });

  const totalOrders = active.reduce((sum, r) => sum + r.metrics.orderCount, 0);
  // Each store counted on its own, then the counts summed: no orders are mixed.
  const openIssues = addBreakdowns(active.map((r) => r.metrics.attention));
  const openIssuesSub = await attentionSummary(openIssues);
  const publishedProducts = active.reduce((sum, r) => sum + r.metrics.publishedProducts, 0);

  return (
    <ClientMessages section="dashboard">
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
              <>
                <Button asChild variant="outline">
                  <Link href="/app/people">{shell("people")}</Link>
                </Button>
                <Button asChild>
                  <Link href="/app/stores/new">{shell("createStore")}</Link>
                </Button>
              </>
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
            value={format.number(openIssues.total)}
            sub={openIssuesSub}
            tone={openIssues.total > 0 ? "amber" : "green"}
            href="/app/attention"
          />
        </div>

        <section className="mt-9">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-foreground">{t("clientStores")}</h2>
              {active.length > 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("revenuePeriod", { from: day(range.from), to: day(range.to) })}
                </p>
              ) : null}
            </div>
            {active.length > 0 ? (
              <RangeControls
                key={rangeQuery(range)}
                base="/app"
                range={range.key}
                from={range.from}
                to={range.to}
                today={now.toISOString().slice(0, 10)}
              />
            ) : null}
          </div>

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
                const progress = setupProgress(setupStatus(store.setup, shipsWithRates.has(store.id), templateIds.has(store.id)));
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
                                paymentsReady(store)
                                  ? "size-4 text-emerald-600"
                                  : "size-4 text-amber-600"
                              }
                            />
                            {store.testMode
                              ? t("testMode")
                              : paymentsReady(store)
                                ? t("stripeConnected")
                                : t("notTakingOrders")}
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
                            <dt className="text-xs text-muted-foreground">{t("revenue")}</dt>
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
                        <RevenueSparkline
                          values={revenue}
                          label={t("revenuePeriod", { from: day(range.from), to: day(range.to) })}
                        />
                        </div>

                        <p className="text-xs text-muted-foreground">
                          {t("inProduction", { count: metrics.inProduction })} ·{" "}
                          {t("shipped", { count: metrics.shipped })} · {t("delivered", { count: metrics.delivered })}
                          {metrics.attention.total > 0 ? (
                            <>
                              {" · "}
                              <Link
                                href={`/app/stores/${store.id}/orders?view=attention`}
                                className="hover:underline"
                              >
                                {metrics.attention.exception > 0 ? (
                                  <span className="text-destructive">
                                    {t("exceptions", { count: metrics.attention.exception })}
                                  </span>
                                ) : null}
                                {metrics.attention.manual_routing > 0 ? (
                                  <span className="text-amber-700">
                                    {metrics.attention.exception > 0 ? " · " : ""}
                                    {t("manual", { count: metrics.attention.manual_routing })}
                                  </span>
                                ) : null}
                                {metrics.attention.awaiting_production > 0 ? (
                                  <span className="text-amber-700">
                                    {metrics.attention.exception + metrics.attention.manual_routing > 0 ? " · " : ""}
                                    {attention("parts.awaiting_production", { count: metrics.attention.awaiting_production })}
                                  </span>
                                ) : null}
                              </Link>
                            </>
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
            <ArchivedStores
              stores={archived.map(({ store, metrics }) => ({
                id: store.id,
                name: store.name,
                detail: t("archivedRow", {
                  client: store.clientName,
                  count: metrics.orderCount,
                  amount: money(metrics.grossSales, store.defaultCurrency),
                }),
              }))}
            />
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
                    <AuditSummary
                      entry={run.entry}
                      can={canIn(run.entry.storeId)}
                      line={run.count > 1 ? t("repeated", { summary: SUMMARY_SLOT, count: run.count }) : undefined}
                    />
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
    </ClientMessages>
  );
}

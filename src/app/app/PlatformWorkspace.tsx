import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { AuditSummary, SUMMARY_SLOT } from "@/components/AuditSummary";
import { Badge, EmptyState, PageHeader, ProgressBar } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAgo } from "@/i18n/format";
import { platformAuditEntries, recentAuditReadSize, recentAuditRuns } from "@/lib/audit-log";
import { listAgencies, listAudit, storesWithShippingRates } from "@/lib/data";
import { setupProgress, setupStatus, type StoreMetrics } from "@/lib/metrics";
import { loadStoreMetrics } from "@/lib/metrics-data";
import { planFor } from "@/lib/plans";
import { accessibleStores, roleCan, type Capability } from "@/lib/session";
import { THEMES, type Agency, type Store, type User } from "@/lib/types";
import { paymentsReady } from "@/lib/payment-mode";

/** Rows the "Recent activity" panel has room for, once repeats are collapsed. */
const ACTIVITY_ROWS = 12;

interface Row {
  store: Store;
  metrics: StoreMetrics;
}

interface Group {
  key: string;
  name: string;
  agency: Agency | null;
  active: Row[];
  archived: Row[];
}

/**
 * What a platform administrator sees at /app.
 *
 * They hold no membership in any store, so nothing here is theirs to run: the
 * stores are grouped under the agency that operates them, counts stay inside a
 * group, and no shopper record or money figure is shown. The agency dashboard
 * in `page.tsx` is the view for people who actually run the stores.
 */
export async function PlatformWorkspace({ user, denied }: { user: User; denied?: string }) {
  const [stores, agencies, audit, t, shell, roles, format] = await Promise.all([
    accessibleStores(user),
    listAgencies(),
    listAudit({}, recentAuditReadSize(ACTIVITY_ROWS)),
    getTranslations("dashboard"),
    getTranslations("shell"),
    getTranslations("roles"),
    getFormatter(),
  ]);
  const now = new Date();

  // Read as platform access: no shopper names, no order values.
  const activity = recentAuditRuns(platformAuditEntries(audit), ACTIVITY_ROWS);
  // Each entry links into its own store, as far as platform access goes there.
  const roleIn = new Map(stores.map(({ store, role }) => [store.id, role]));
  const canIn = (storeId: string | null) => (capability: Capability) => {
    const role = storeId ? roleIn.get(storeId) : undefined;
    return role ? roleCan(role, capability) : false;
  };

  // Every store's figures added up in the database, as on the agency
  // dashboard: platform oversight lists every store on the platform, so reading
  // their orders into the Worker made this the slowest page in the app.
  const [metricsByStore, shipsWithRates] = await Promise.all([
    loadStoreMetrics(stores.map(({ store }) => store)),
    storesWithShippingRates(stores.map(({ store }) => store.id)),
  ]);

  const rows: Row[] = stores.map(({ store }) => ({
    store,
    metrics: metricsByStore.get(store.id)!,
  }));

  // Every agency gets a section, including one that has not opened a store yet,
  // and a store whose agency record is gone still has to appear somewhere.
  const groups = new Map<string, Group>();
  for (const agency of agencies) {
    groups.set(agency.id, { key: agency.id, name: agency.name, agency, active: [], archived: [] });
  }
  for (const row of rows) {
    let group = groups.get(row.store.agencyId);
    if (!group) {
      group = { key: row.store.agencyId, name: t("platform.missingAgency"), agency: null, active: [], archived: [] };
      groups.set(row.store.agencyId, group);
    }
    (row.store.status === "active" ? group.active : group.archived).push(row);
  }
  const grouped = [...groups.values()].filter((g) => g.agency || g.active.length || g.archived.length);

  return (
    <>
      <AppHeader user={user} stores={stores} />
      <div className="mx-auto w-full max-w-[92rem] flex-1 px-4 py-7 sm:px-6">
        <PageHeader
          title={t("title")}
          description={
            <>
              {t("platform.agencies", { count: agencies.length })}
              <span className="mt-0.5 block">{roles("platformAccessNote")}</span>
            </>
          }
          actions={
            <Button asChild>
              <Link href="/app/stores/new">{shell("createStore")}</Link>
            </Button>
          }
        />

        {denied ? (
          <p role="alert" className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {denied === "1" ? t("platform.deniedStore") : t("platform.deniedPage")}
          </p>
        ) : null}

        {grouped.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title={t("platform.emptyTitle")}
              description={t("platform.emptyBody")}
              action={
                <Button asChild>
                  <Link href="/admin/agencies">{t("platform.openAdmin")}</Link>
                </Button>
              }
            />
          </div>
        ) : null}

        {grouped.map((group) => (
          <section key={group.key} className="mt-9">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border pb-3">
              <h2 className="text-base font-semibold text-foreground">{group.name}</h2>
              {group.agency ? (
                <>
                  <Badge tone="neutral">{t("platform.plan", { plan: planFor(group.agency.plan).name })}</Badge>
                  {group.agency.status === "suspended" ? <Badge tone="rose">{t("platform.suspended")}</Badge> : null}
                </>
              ) : (
                <Badge tone="amber">{t("platform.noAgencyRecord")}</Badge>
              )}
              <p className="text-xs text-muted-foreground">
                {t("activeStores", { count: group.active.length })}
                {group.archived.length ? t("archivedSuffix", { count: group.archived.length }) : ""}
              </p>
            </div>

            {group.active.length === 0 && group.archived.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">{t("platform.noStores")}</p>
            ) : null}

            {group.active.length > 0 ? (
              <ul className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {group.active.map(({ store, metrics }) => {
                  const progress = setupProgress(setupStatus(store.setup, shipsWithRates.has(store.id)));
                  const theme = THEMES[store.theme];
                  return (
                    <li key={store.id} className="flex">
                      <Card className="flex-1">
                      <CardHeader>
                        <CardTitle asChild>
                          <h3>
                            <Link href={`/app/stores/${store.id}`} className="hover:underline">
                              {store.name}
                            </Link>
                          </h3>
                        </CardTitle>
                        <p className="truncate text-sm text-muted-foreground">
                          {store.clientName} · {group.name}
                        </p>
                        <CardAction>
                          <span
                            aria-hidden
                            className="block h-8 w-8 shrink-0 rounded-lg border border-border"
                            style={{ background: theme.accent }}
                          />
                        </CardAction>
                      </CardHeader>

                      <CardContent>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge tone="iris">{roles("platformAccess")}</Badge>
                        <Badge tone={paymentsReady(store) ? "green" : "amber"}>
                          {paymentsReady(store) ? t("stripeConnected") : t("stripePending")}
                        </Badge>
                        {store.customDomain ? (
                          <Badge tone={store.domainStatus === "verified" ? "green" : "amber"}>
                            {store.customDomain}
                          </Badge>
                        ) : null}
                      </div>

                      {/* Operational status only — no sales figures, no shopper records. */}
                      <dl className="mt-4 grid grid-cols-3 gap-3 border-y border-border py-3 text-sm">
                        <div>
                          <dt className="text-xs text-muted-foreground">{t("orders")}</dt>
                          <dd className="mt-0.5 font-semibold tabular-nums text-foreground">
                            {format.number(metrics.orderCount)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">{t("platform.published")}</dt>
                          <dd className="mt-0.5 font-semibold tabular-nums text-foreground">
                            {format.number(metrics.publishedProducts)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">{t("statAttention")}</dt>
                          <dd className="mt-0.5 font-semibold tabular-nums text-foreground">
                            {format.number(metrics.awaitingAction)}
                          </dd>
                        </div>
                      </dl>

                      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                        <Badge tone="slate">{t("inProduction", { count: metrics.inProduction })}</Badge>
                        <Badge tone="slate">{t("shipped", { count: metrics.shipped })}</Badge>
                        <Badge tone="slate">{t("delivered", { count: metrics.delivered })}</Badge>
                        {metrics.exceptions > 0 ? (
                          <Badge tone="rose">{t("exceptions", { count: metrics.exceptions })}</Badge>
                        ) : null}
                        {metrics.manualRouting > 0 ? (
                          <Badge tone="amber">{t("manual", { count: metrics.manualRouting })}</Badge>
                        ) : null}
                      </div>

                      {progress.pct < 100 ? (
                        <div className="mt-4">
                          <ProgressBar value={progress.pct} label={t("setup", { done: progress.done, total: progress.total })} />
                        </div>
                      ) : null}

                      </CardContent>

                      <CardFooter className="mt-auto flex-wrap gap-2">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/app/stores/${store.id}`}>{t("open")}</Link>
                        </Button>
                        <Button asChild variant="ghost" size="sm">
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
            ) : null}

            {group.archived.length > 0 ? (
              <Card asChild className="mt-4 py-0">
              <ul className="divide-y divide-border">
                {group.archived.map(({ store, metrics }) => (
                  <li key={store.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {store.name} <span className="font-normal text-muted-foreground">{t("platform.archivedLabel")}</span>
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {store.clientName} · {t("platform.historicOrders", { count: metrics.orderCount })}
                      </p>
                    </div>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/app/stores/${store.id}`}>{t("open")}</Link>
                    </Button>
                  </li>
                ))}
              </ul>
              </Card>
            ) : null}
          </section>
        ))}

        <section className="mt-9 pb-4">
          <h2 className="text-base font-semibold text-foreground">{t("platform.recentActivity")}</h2>
          {activity.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t("nothingYet")}</p>
          ) : (
            <Card asChild className="mt-4 py-0">
            <ol className="divide-y divide-border">
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
            </Card>
          )}
        </section>
      </div>
    </>
  );
}

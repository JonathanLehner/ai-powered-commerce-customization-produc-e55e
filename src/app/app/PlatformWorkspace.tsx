import Link from "next/link";
import { StoreCard } from "@/app/app/StoreCard";
import { AppHeader } from "@/components/AppHeader";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { auditRunSummary, platformAuditEntries, recentAuditReadSize, recentAuditRuns } from "@/lib/audit-log";
import { listAgencies, listAudit, listOrdersByStore, listStoreProductsByStore } from "@/lib/data";
import { storeMetrics, type StoreMetrics } from "@/lib/metrics";
import { planFor } from "@/lib/plans";
import { accessibleStores } from "@/lib/session";
import { PLATFORM_ACCESS_LABEL, PLATFORM_ACCESS_NOTE, type Agency, type Store, type User } from "@/lib/types";
import { relativeTime } from "@/lib/util";

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
  const [stores, agencies, audit] = await Promise.all([
    accessibleStores(user),
    listAgencies(),
    listAudit({}, recentAuditReadSize(ACTIVITY_ROWS)),
  ]);

  // Read as platform access: no shopper names, no order values.
  const activity = recentAuditRuns(platformAuditEntries(audit), ACTIVITY_ROWS);

  // One read for every store's orders and one for their products, as on the
  // agency dashboard — platform oversight lists every store on the platform, so
  // a pair of reads per store was the slowest page in the app.
  const storeIds = stores.map(({ store }) => store.id);
  const [ordersByStore, productsByStore] = await Promise.all([
    listOrdersByStore(storeIds),
    listStoreProductsByStore(storeIds),
  ]);

  const rows: Row[] = stores.map(({ store }) => ({
    store,
    metrics: storeMetrics(
      ordersByStore.get(store.id) ?? [],
      productsByStore.get(store.id) ?? [],
      store.defaultCurrency,
    ),
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
      group = { key: row.store.agencyId, name: "Agency record missing", agency: null, active: [], archived: [] };
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
          title={`Good to see you, ${user.name.split(" ")[0]}`}
          description={
            <>
              Platform access across {agencies.length} {agencies.length === 1 ? "agency" : "agencies"}. Stores
              are listed under the agency that operates them and nothing is counted across agencies.
              <span className="mt-0.5 block">{PLATFORM_ACCESS_NOTE}</span>
            </>
          }
          actions={
            <Button asChild>
              <Link href="/app/stores/new">Create a client store</Link>
            </Button>
          }
        />

        {denied ? (
          <p role="alert" className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {denied === "1"
              ? "That store no longer exists."
              : "Platform access does not include that screen. It stays with the store team."}
          </p>
        ) : null}

        {grouped.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title="No agencies yet"
              description="Agencies and their stores appear here once the first one is set up in the platform admin."
              action={
                <Button asChild>
                  <Link href="/admin/agencies">Open platform admin</Link>
                </Button>
              }
            />
          </div>
        ) : null}

        {grouped.map((group) => (
          <section key={group.key} className="mt-9">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border pb-3">
              <h2 className="font-heading text-base font-medium text-foreground">{group.name}</h2>
              {group.agency ? (
                <>
                  <Badge tone="neutral">{planFor(group.agency.plan).name} plan</Badge>
                  {group.agency.status === "suspended" ? <Badge tone="rose">Suspended</Badge> : null}
                </>
              ) : (
                <Badge tone="amber">No agency record</Badge>
              )}
              <p className="text-xs text-muted-foreground">
                {group.active.length} active {group.active.length === 1 ? "store" : "stores"}
                {group.archived.length ? `, ${group.archived.length} archived` : ""} · counted within this
                agency only
              </p>
            </div>

            {group.active.length === 0 && group.archived.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No stores yet.</p>
            ) : null}

            {group.active.length > 0 ? (
              <ul className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {group.active.map(({ store, metrics }) => (
                  <li key={store.id}>
                    {/* Operational status only — no sales figures, no shopper records. */}
                    <StoreCard
                      store={store}
                      subtitle={`${store.clientName} · ${group.name}`}
                      badge={{ label: PLATFORM_ACCESS_LABEL, tone: "iris" }}
                      stats={[
                        { label: "Orders", value: String(metrics.orderCount) },
                        { label: "Published", value: String(metrics.publishedProducts) },
                        { label: "Needs attention", value: String(metrics.awaitingAction) },
                      ]}
                      metrics={metrics}
                    />
                  </li>
                ))}
              </ul>
            ) : null}

            {group.archived.length > 0 ? (
              <Card className="mt-4 py-0">
                <ul className="divide-y divide-border">
                  {group.archived.map(({ store, metrics }) => (
                    <li
                      key={store.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {store.name} <span className="font-normal text-muted-foreground">· archived</span>
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {store.clientName} · {metrics.orderCount} historic orders
                        </p>
                      </div>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/app/stores/${store.id}`}>Open</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </section>
        ))}

        <section className="mt-9 pb-4">
          <h2 className="font-heading text-base font-medium text-foreground">Recent platform activity</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Who did what, across every agency. Order and customer records are not part of it.
          </p>
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

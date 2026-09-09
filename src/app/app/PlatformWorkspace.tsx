import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { Badge, EmptyState, PageHeader, ProgressBar } from "@/components/ui";
import { auditRunSummary, recentAuditReadSize, recentAuditRuns } from "@/lib/audit-log";
import { listAgencies, listAudit, listOrders, listStoreProducts } from "@/lib/data";
import { setupProgress, storeMetrics, type StoreMetrics } from "@/lib/metrics";
import { planFor } from "@/lib/plans";
import { accessibleStores } from "@/lib/session";
import { PLATFORM_ACCESS_LABEL, PLATFORM_ACCESS_NOTE, THEMES, type Agency, type Store, type User } from "@/lib/types";
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

  const activity = recentAuditRuns(audit, ACTIVITY_ROWS);

  const rows: Row[] = await Promise.all(
    stores.map(async ({ store }) => {
      const [orders, products] = await Promise.all([listOrders(store.id), listStoreProducts(store.id)]);
      return { store, metrics: storeMetrics(orders, products, store.defaultCurrency) };
    }),
  );

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
            <Link href="/app/stores/new" className="btn-primary">
              Create a client store
            </Link>
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
                <Link href="/admin/agencies" className="btn-primary">
                  Open platform admin
                </Link>
              }
            />
          </div>
        ) : null}

        {grouped.map((group) => (
          <section key={group.key} className="mt-9">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line pb-3">
              <h2 className="text-base font-semibold text-ink">{group.name}</h2>
              {group.agency ? (
                <>
                  <Badge tone="neutral">{planFor(group.agency.plan).name} plan</Badge>
                  {group.agency.status === "suspended" ? <Badge tone="rose">Suspended</Badge> : null}
                </>
              ) : (
                <Badge tone="amber">No agency record</Badge>
              )}
              <p className="text-xs text-muted">
                {group.active.length} active {group.active.length === 1 ? "store" : "stores"}
                {group.archived.length ? `, ${group.archived.length} archived` : ""} · counted within this
                agency only
              </p>
            </div>

            {group.active.length === 0 && group.archived.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No stores yet.</p>
            ) : null}

            {group.active.length > 0 ? (
              <ul className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {group.active.map(({ store, metrics }) => {
                  const progress = setupProgress(store.setup);
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
                          <p className="truncate text-sm text-muted">
                            {store.clientName} · {group.name}
                          </p>
                        </div>
                        <span
                          aria-hidden
                          className="h-8 w-8 shrink-0 rounded-lg border border-line"
                          style={{ background: theme.accent }}
                        />
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <Badge tone="iris">{PLATFORM_ACCESS_LABEL}</Badge>
                        <Badge tone={store.stripe.connected ? "green" : "amber"}>
                          {store.stripe.connected ? "Stripe connected" : "Stripe pending"}
                        </Badge>
                        {store.customDomain ? (
                          <Badge tone={store.domainStatus === "verified" ? "green" : "amber"}>
                            {store.customDomain}
                          </Badge>
                        ) : null}
                      </div>

                      {/* Operational status only — no sales figures, no shopper records. */}
                      <dl className="mt-4 grid grid-cols-3 gap-3 border-y border-line py-3 text-sm">
                        <div>
                          <dt className="text-xs text-muted">Orders</dt>
                          <dd className="mt-0.5 font-semibold tabular-nums text-ink">{metrics.orderCount}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted">Published</dt>
                          <dd className="mt-0.5 font-semibold tabular-nums text-ink">
                            {metrics.publishedProducts}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted">Needs attention</dt>
                          <dd className="mt-0.5 font-semibold tabular-nums text-ink">
                            {metrics.awaitingAction}
                          </dd>
                        </div>
                      </dl>

                      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                        <span className="chip">{metrics.inProduction} in production</span>
                        <span className="chip">{metrics.shipped} shipped</span>
                        <span className="chip">{metrics.delivered} delivered</span>
                        {metrics.exceptions > 0 ? (
                          <Badge tone="rose">
                            {metrics.exceptions} exception{metrics.exceptions === 1 ? "" : "s"}
                          </Badge>
                        ) : null}
                        {metrics.manualRouting > 0 ? <Badge tone="amber">{metrics.manualRouting} manual</Badge> : null}
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
            ) : null}

            {group.archived.length > 0 ? (
              <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
                {group.archived.map(({ store, metrics }) => (
                  <li key={store.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {store.name} <span className="font-normal text-muted">· archived</span>
                      </p>
                      <p className="truncate text-xs text-muted">
                        {store.clientName} · {metrics.orderCount} historic orders
                      </p>
                    </div>
                    <Link href={`/app/stores/${store.id}`} className="btn-ghost btn-sm">
                      Open
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}

        <section className="mt-9 pb-4">
          <h2 className="text-base font-semibold text-ink">Recent platform activity</h2>
          <p className="mt-1 text-sm text-muted">
            Who did what, across every agency. Order and customer records are not part of it.
          </p>
          {activity.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nothing recorded yet.</p>
          ) : (
            <ol className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
              {activity.map((run) => (
                <li key={run.entry.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5">
                  <span className="text-sm text-ink">{auditRunSummary(run)}</span>
                  <span className="text-xs text-muted">
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

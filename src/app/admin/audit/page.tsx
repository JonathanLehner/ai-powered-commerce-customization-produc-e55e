import { AuditCoverageNote, AuditFilterBar, AuditPager } from "@/components/AuditControls";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import {
  auditActors,
  auditDetail,
  auditQuery,
  auditWindow,
  collapseAuditRuns,
  hasAuditFilters,
  matchesAuditFilters,
  pageAuditEntries,
  parseAuditFilters,
  AUDIT_VIEW_CAP,
  type AuditParams,
} from "@/lib/audit-log";
import { listAllStores, loadAuditWindow } from "@/lib/data";
import { AUDIT_CATEGORY_LABELS } from "@/lib/types";
import { formatDateTime } from "@/lib/util";

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<AuditParams> }) {
  const filters = parseAuditFilters(await searchParams);
  const stores = await listAllStores();
  const storeName = (id: string | null) => (id ? (stores.find((s) => s.id === id)?.name ?? id) : "Platform");

  // Nothing on the platform predates the oldest store by more than the margin
  // `auditWindow` adds, so that is where an unbounded read starts from.
  const earliest = stores.reduce(
    (oldest, store) => (store.createdAt < oldest ? store.createdAt : oldest),
    new Date().toISOString(),
  );
  const scope: Record<string, unknown> = {};
  if (filters.category) scope.category = filters.category;
  const { entries, coveredFrom, truncated } = await loadAuditWindow(
    scope,
    auditWindow(filters, earliest, new Date().toISOString()),
    AUDIT_VIEW_CAP,
  );

  const actors = auditActors(entries, filters.actorId);
  const matched = entries.filter((entry) => matchesAuditFilters(entry, filters));
  const page = pageAuditEntries(matched, filters.page);
  const base = "/admin/audit";

  return (
    <div className="space-y-6">
      <PageHeader title="Platform audit log" description="Every recorded change across the platform." />

      <AuditFilterBar
        basePath={base}
        filters={filters}
        actors={actors}
        exportHref={`${base}/export${auditQuery(filters, { page: 1 })}`}
      />

      {page.total === 0 ? (
        <EmptyState
          title={hasAuditFilters(filters) ? "Nothing matches those filters" : "No entries"}
          description={
            hasAuditFilters(filters)
              ? "Try a wider date range, another person, or clear the search."
              : "Nothing has been recorded on the platform yet."
          }
        />
      ) : (
        <div className="space-y-3">
          <AuditPager basePath={base} filters={filters} page={page} />
          <div className="card relative overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead className="bg-canvas text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">When</th>
                  <th scope="col" className="px-4 py-3">Scope</th>
                  <th scope="col" className="px-4 py-3">Action</th>
                  <th scope="col" className="px-4 py-3">Actor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {collapseAuditRuns(page.entries).map((run) => {
                  const entry = run.entry;
                  const detail = auditDetail(entry);
                  return (
                    <tr key={entry.id} className="align-top">
                      <td className="whitespace-nowrap px-4 py-3 text-muted">
                        {formatDateTime(entry.at)}
                        {run.count > 1 ? (
                          <p className="text-xs text-muted">back to {formatDateTime(run.earliest)}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone="neutral">{AUDIT_CATEGORY_LABELS[entry.category]}</Badge>
                        <p className="mt-1 text-xs text-muted">{storeName(entry.storeId)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-ink">
                          {entry.summary}
                          {run.count > 1 ? (
                            <span className="ml-2 align-middle">
                              <Badge tone="slate">×{run.count}</Badge>
                            </span>
                          ) : null}
                        </p>
                        <p className="font-mono text-xs text-muted">{entry.action}</p>
                        {detail ? <p className="text-xs text-muted">{detail}</p> : null}
                      </td>
                      <td className="px-4 py-3 text-inksoft">{entry.actorName}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <AuditPager basePath={base} filters={filters} page={page} />
        </div>
      )}

      {truncated ? <AuditCoverageNote coveredFrom={coveredFrom} /> : null}
    </div>
  );
}

import { AuditCoverageNote, AuditFilterBar, AuditPager } from "@/components/AuditControls";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import {
  auditDetail,
  auditActors,
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
import { getAgency, loadAuditWindow } from "@/lib/data";
import { auditExportMessage, planFor } from "@/lib/plans";
import { requireStoreAccess } from "@/lib/session";
import { AUDIT_CATEGORY_LABELS, type AuditCategory } from "@/lib/types";
import { formatDateTime } from "@/lib/util";

const TONES: Record<AuditCategory, "brand" | "iris" | "green" | "amber" | "slate" | "neutral"> = {
  store_setup: "brand",
  product_import: "neutral",
  pricing: "amber",
  ai: "iris",
  publishing: "green",
  order_routing: "brand",
  administration: "slate",
  team: "neutral",
  gifting: "iris",
};

export default async function ActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<AuditParams>;
}) {
  const { storeId } = await params;
  const filters = parseAuditFilters(await searchParams);
  const { store } = await requireStoreAccess(storeId);
  const agency = await getAgency(store.agencyId);
  const plan = planFor(agency?.plan);

  // The category and the dates narrow the read itself; the person and the search
  // are applied to what comes back, so the "made by" list can offer everyone who
  // appears in the range rather than only the one already chosen.
  const scope: Record<string, unknown> = { storeId };
  if (filters.category) scope.category = filters.category;
  const { entries, coveredFrom, truncated } = await loadAuditWindow(
    scope,
    auditWindow(filters, store.createdAt, new Date().toISOString()),
    AUDIT_VIEW_CAP,
  );

  const actors = auditActors(entries, filters.actorId);
  const matched = entries.filter((entry) => matchesAuditFilters(entry, filters));
  const page = pageAuditEntries(matched, filters.page);
  const base = `/app/stores/${storeId}/activity`;

  return (
    <div className="space-y-6">
      <PageHeader title="Audit history" description={`Every recorded change in ${store.name}.`} />

      <AuditFilterBar
        basePath={base}
        filters={filters}
        actors={actors}
        exportHref={plan.auditExport ? `${base}/export${auditQuery(filters, { page: 1 })}` : null}
        exportNote={plan.auditExport ? undefined : auditExportMessage(plan, agency?.name ?? "This agency")}
      />

      {page.total === 0 ? (
        <EmptyState
          title={hasAuditFilters(filters) ? "Nothing matches those filters" : "Nothing recorded here yet"}
          description={
            hasAuditFilters(filters)
              ? "Try a wider date range, another person, or clear the search."
              : "Audit entries are written automatically whenever someone changes settings, imports a product, changes a price, approves an AI suggestion, publishes, or routes an order."
          }
        />
      ) : (
        <div className="space-y-3">
          <AuditPager basePath={base} filters={filters} page={page} />
          <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
            {collapseAuditRuns(page.entries).map((run) => {
              const entry = run.entry;
              const detail = auditDetail(entry);
              return (
                <li key={entry.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={TONES[entry.category]}>{AUDIT_CATEGORY_LABELS[entry.category]}</Badge>
                      <span className="font-mono text-xs text-muted">{entry.action}</span>
                      {run.count > 1 ? <Badge tone="slate">×{run.count}</Badge> : null}
                    </div>
                    <p className="mt-1.5 text-sm text-ink">{entry.summary}</p>
                    {detail ? <p className="mt-1 text-xs text-muted">{detail}</p> : null}
                    {run.count > 1 ? (
                      <p className="mt-1 text-xs text-muted">
                        {run.count} identical entries between {formatDateTime(run.earliest)} and{" "}
                        {formatDateTime(run.latest)}. Every one of them is in the download.
                      </p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm text-inksoft">{entry.actorName}</p>
                    <p className="text-xs text-muted">{formatDateTime(entry.at)}</p>
                  </div>
                </li>
              );
            })}
          </ol>
          <AuditPager basePath={base} filters={filters} page={page} />
        </div>
      )}

      {truncated ? <AuditCoverageNote coveredFrom={coveredFrom} /> : null}
    </div>
  );
}

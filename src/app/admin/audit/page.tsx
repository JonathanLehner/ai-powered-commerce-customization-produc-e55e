import { AuditCoverageNote, AuditFilterBar, AuditPager } from "@/components/AuditControls";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  auditActors,
  auditDetail,
  auditQuery,
  auditWindow,
  hasAuditFilters,
  matchesAuditFilters,
  pageAuditEntries,
  parseAuditFilters,
  platformAuditEntries,
  AUDIT_VIEW_CAP,
  type AuditParams,
} from "@/lib/audit-log";
import { listAllStores, listSuppliers, loadAuditWindow } from "@/lib/data";
import { AUDIT_CATEGORY_LABELS, PLATFORM_ACCESS_NOTE, type AuditLog } from "@/lib/types";
import { formatDateTime } from "@/lib/util";

/** The column-head style every table in the workspace shares. */
const TH = "px-4 text-xs font-semibold tracking-wide uppercase text-muted-foreground";

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<AuditParams> }) {
  const filters = parseAuditFilters(await searchParams);
  const stores = await listAllStores();
  const storeName = (id: string | null) => (id ? (stores.find((s) => s.id === id)?.name ?? id) : "Platform");
  // The log spans every store, so an amount is read in the currency of the store
  // whose entry it is.
  const suppliers = await listSuppliers();
  const detail = {
    currency: (entry: AuditLog) => stores.find((s) => s.id === entry.storeId)?.defaultCurrency,
    supplierName: (id: string) => suppliers.find((supplier) => supplier.id === id)?.name,
  };

  // Nothing on the platform predates the oldest store by more than the margin
  // `auditWindow` adds, so that is where an unbounded read starts from.
  const earliest = stores.reduce(
    (oldest, store) => (store.createdAt < oldest ? store.createdAt : oldest),
    new Date().toISOString(),
  );
  const scope: Record<string, unknown> = {};
  if (filters.category) scope.category = filters.category;
  const loaded = await loadAuditWindow(
    scope,
    auditWindow(filters, earliest, new Date().toISOString()),
    AUDIT_VIEW_CAP,
  );
  const { coveredFrom, truncated } = loaded;
  // The log covers every agency, and nobody reading it runs a store, so it is
  // read as platform access: no shopper names, no order values. Redacted before
  // the filters run, so neither the search nor the "made by" list can confirm a
  // name the table does not show.
  const entries = platformAuditEntries(loaded.entries);

  const actors = auditActors(entries, filters.actorId);
  const matched = entries.filter((entry) => matchesAuditFilters(entry, filters));
  const page = pageAuditEntries(matched, filters.page);
  const base = "/admin/audit";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform audit log"
        description={`Every recorded change across the platform. ${PLATFORM_ACCESS_NOTE}`}
      />

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
          <Card className="py-0">
            <Table className="min-w-[52rem]">
              <TableHeader className="bg-muted">
                <TableRow className="hover:bg-transparent">
                  <TableHead className={TH}>When</TableHead>
                  <TableHead className={TH}>Scope</TableHead>
                  <TableHead className={TH}>Action</TableHead>
                  <TableHead className={TH}>Actor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.entries.map((entry) => {
                  const line = auditDetail(entry, detail);
                  return (
                    <TableRow key={entry.id} className="align-top hover:bg-transparent">
                      <TableCell className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {formatDateTime(entry.at)}
                      </TableCell>
                      <TableCell className="px-4 py-3 whitespace-normal">
                        <Badge tone="neutral">{AUDIT_CATEGORY_LABELS[entry.category]}</Badge>
                        <p className="mt-1 text-xs text-muted-foreground">{storeName(entry.storeId)}</p>
                      </TableCell>
                      <TableCell className="px-4 py-3 whitespace-normal">
                        <p className="text-foreground">{entry.summary}</p>
                        <p className="font-mono text-xs text-muted-foreground">{entry.action}</p>
                        {line ? <p className="text-xs text-muted-foreground">{line}</p> : null}
                      </TableCell>
                      <TableCell className="px-4 py-3 whitespace-normal text-muted-foreground">
                        {entry.actorName}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
          <AuditPager basePath={base} filters={filters} page={page} />
        </div>
      )}

      {truncated ? <AuditCoverageNote coveredFrom={coveredFrom} /> : null}
    </div>
  );
}

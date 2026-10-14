import { getLocale, getTranslations } from "next-intl/server";
import { AuditCoverageNote, AuditFilterBar, AuditPager } from "@/components/AuditControls";
import { AuditSummary } from "@/components/AuditSummary";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { Card } from "@/components/ui/card";
import {
  auditDetail,
  auditActors,
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
import { listSuppliers, loadAuditWindow } from "@/lib/data";
import { auditExportText } from "@/i18n/plan-copy";
import { planFor } from "@/lib/plans";
import { getAgencyForRender, requireStoreAccess, roleCan } from "@/lib/session";
import type { Capability } from "@/lib/store-access";
import type { AuditCategory } from "@/lib/types";
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
  sourcing: "amber",
  email: "slate",
  discounts: "green",
  customers: "neutral",
  inventory: "amber",
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
  const { store, role, viaPlatform } = await requireStoreAccess(storeId);
  const can = (capability: Capability) => roleCan(role, capability);
  const agency = await getAgencyForRender(store.agencyId);
  const plan = planFor(agency?.plan);
  // Recorded fields are stored as the code wrote them, so the supplier names and
  // the store's currency are what turns them back into a readable line.
  const suppliers = await listSuppliers();
  const detail = {
    currency: store.defaultCurrency,
    supplierName: (id: string) => suppliers.find((supplier) => supplier.id === id)?.name,
  };

  // The category and the dates narrow the read itself; the person and the search
  // are applied to what comes back, so the "made by" list can offer everyone who
  // appears in the range rather than only the one already chosen.
  const scope: Record<string, unknown> = { storeId };
  if (filters.category) scope.category = filters.category;
  const loaded = await loadAuditWindow(
    scope,
    auditWindow(filters, store.createdAt, new Date().toISOString()),
    AUDIT_VIEW_CAP,
  );
  const { coveredFrom, truncated } = loaded;
  // Platform access reads the history without the shopper names and the order
  // values in it. Redacted before the filters run, so the search box and the
  // "made by" list cannot confirm a name the page does not show.
  const entries = viaPlatform ? platformAuditEntries(loaded.entries) : loaded.entries;

  const actors = auditActors(entries, filters.actorId);
  const matched = entries.filter((entry) => matchesAuditFilters(entry, filters));
  const page = pageAuditEntries(matched, filters.page);
  const base = `/app/stores/${storeId}/activity`;

  const [pages, roles, t, labels, locale] = await Promise.all([
    getTranslations("pages.store"),
    getTranslations("roles"),
    getTranslations("audit"),
    getTranslations("labels"),
    getLocale(),
  ]);
  const exportNote = plan.auditExport ? undefined : await auditExportText(plan, agency?.name);
  return (
    <div className="space-y-6">
      <PageHeader
        title={pages("activityTitle")}
                description={viaPlatform ? roles("platformAccessNote") : undefined}
      />

      <AuditFilterBar
        basePath={base}
        filters={filters}
        actors={actors}
        exportHref={plan.auditExport ? `${base}/export${auditQuery(filters, { page: 1 })}` : null}
        exportNote={exportNote}
      />

      {page.total === 0 ? (
        <EmptyState
          title={hasAuditFilters(filters) ? t("noMatches") : t("noActivity")}
          description={hasAuditFilters(filters) ? t("tryFilters") : undefined}
        />
      ) : (
        <div className="space-y-3">
          <AuditPager basePath={base} filters={filters} page={page} />
          <Card asChild className="py-0">
          <ol className="divide-y divide-border">
            {page.entries.map((entry) => {
              const line = auditDetail(entry, detail);
              return (
                <li key={entry.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={TONES[entry.category]}>{labels(`auditCategory.${entry.category}`)}</Badge>
                      <span className="font-mono text-xs text-muted-foreground">{entry.action}</span>
                    </div>
                    <p className="mt-1.5 text-sm text-foreground">
                      <AuditSummary entry={entry} can={can} />
                    </p>
                    {line ? <p className="mt-1 text-xs text-muted-foreground">{line}</p> : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm text-inksoft">{entry.actorName}</p>
                    {entry.via === "assistant" ? <p className="text-xs text-muted-foreground">{t("viaAssistant")}</p> : null}
                    <p className="text-xs text-muted-foreground">{formatDateTime(entry.at, locale)}</p>
                  </div>
                </li>
              );
            })}
          </ol>
          </Card>
          <AuditPager basePath={base} filters={filters} page={page} />
        </div>
      )}

      {truncated ? <AuditCoverageNote coveredFrom={coveredFrom} /> : null}
    </div>
  );
}

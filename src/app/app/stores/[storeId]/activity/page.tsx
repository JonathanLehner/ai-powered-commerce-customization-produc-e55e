import Link from "next/link";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { listAudit } from "@/lib/data";
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
};

export default async function ActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ category?: string }>;
}) {
  const { storeId } = await params;
  const { category } = await searchParams;
  const { store } = await requireStoreAccess(storeId);

  const filter: Record<string, unknown> = { storeId };
  if (category) filter.category = category;
  const entries = await listAudit(filter, 100);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Activity"
        title="Audit history"
        description={`Everything that changed in ${store.name}: setup, imports, pricing, AI approvals, publishing, order routing and administration.`}
      />

      <nav aria-label="Filter by category" className="flex flex-wrap gap-2">
        <Link
          href={`/app/stores/${storeId}/activity`}
          className={!category ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
        >
          All
        </Link>
        {(Object.keys(AUDIT_CATEGORY_LABELS) as AuditCategory[]).map((key) => (
          <Link
            key={key}
            href={`/app/stores/${storeId}/activity?category=${key}`}
            className={category === key ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
          >
            {AUDIT_CATEGORY_LABELS[key]}
          </Link>
        ))}
      </nav>

      {entries.length === 0 ? (
        <EmptyState
          title="Nothing recorded here yet"
          description="Audit entries are written automatically whenever someone changes settings, imports a product, changes a price, approves an AI suggestion, publishes, or routes an order."
        />
      ) : (
        <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={TONES[entry.category]}>{AUDIT_CATEGORY_LABELS[entry.category]}</Badge>
                  <span className="font-mono text-xs text-muted">{entry.action}</span>
                </div>
                <p className="mt-1.5 text-sm text-ink">{entry.summary}</p>
                {Object.keys(entry.meta).length > 0 ? (
                  <p className="mt-1 text-xs text-muted">
                    {Object.entries(entry.meta)
                      .map(([key, value]) => `${key}: ${value}`)
                      .join(" · ")}
                  </p>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm text-inksoft">{entry.actorName}</p>
                <p className="text-xs text-muted">{formatDateTime(entry.at)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

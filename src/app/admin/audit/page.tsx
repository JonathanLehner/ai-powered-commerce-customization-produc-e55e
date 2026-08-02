import Link from "next/link";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { listAllStores, listAudit } from "@/lib/data";
import { AUDIT_CATEGORY_LABELS, type AuditCategory } from "@/lib/types";
import { formatDateTime } from "@/lib/util";

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const filter: Record<string, unknown> = {};
  if (category) filter.category = category;

  const [entries, stores] = await Promise.all([listAudit(filter, 100), listAllStores()]);
  const storeName = (id: string | null) => (id ? stores.find((s) => s.id === id)?.name ?? id : "Platform");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform audit log"
        description="Every recorded change across the platform."
      />

      <nav aria-label="Filter by category" className="flex flex-wrap gap-2">
        <Link href="/admin/audit" className={!category ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>
          All
        </Link>
        {(Object.keys(AUDIT_CATEGORY_LABELS) as AuditCategory[]).map((key) => (
          <Link
            key={key}
            href={`/admin/audit?category=${key}`}
            className={category === key ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
          >
            {AUDIT_CATEGORY_LABELS[key]}
          </Link>
        ))}
      </nav>

      {entries.length === 0 ? (
        <EmptyState title="No entries" description="Nothing has been recorded in this category yet." />
      ) : (
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
              {entries.map((entry) => (
                <tr key={entry.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDateTime(entry.at)}</td>
                  <td className="px-4 py-3">
                    <Badge tone="neutral">{AUDIT_CATEGORY_LABELS[entry.category]}</Badge>
                    <p className="mt-1 text-xs text-muted">{storeName(entry.storeId)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-ink">{entry.summary}</p>
                    <p className="font-mono text-xs text-muted">{entry.action}</p>
                  </td>
                  <td className="px-4 py-3 text-inksoft">{entry.actorName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { Badge, PageHeader, StatCard } from "@/components/ui";
import {
  listAgencies,
  listAllStores,
  listAudit,
  listCatalogProducts,
  listSuppliers,
  listTaxBrackets,
} from "@/lib/data";
import { formatDateTime } from "@/lib/util";

export default async function AdminOverviewPage() {
  const [agencies, stores, suppliers, catalog, brackets, audit] = await Promise.all([
    listAgencies(),
    listAllStores(),
    listSuppliers(),
    listCatalogProducts(),
    listTaxBrackets(),
    listAudit({}, 12),
  ]);

  const pendingSuppliers = suppliers.filter((s) => s.status === "pending_review");
  const activeStores = stores.filter((s) => s.status === "active");

  return (
    <div className="space-y-7">
      <PageHeader
        title="Operations overview"
        description="Suppliers, the shared catalog, global tax rates and agency access."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Agencies" value={String(agencies.length)} sub={`${agencies.filter((a) => a.status === "active").length} active`} />
        <StatCard label="Stores" value={String(stores.length)} sub={`${activeStores.length} active`} />
        <StatCard
          label="Approved suppliers"
          value={String(suppliers.filter((s) => s.status === "approved").length)}
          sub={`${pendingSuppliers.length} awaiting review`}
          tone={pendingSuppliers.length > 0 ? "amber" : "green"}
        />
        <StatCard label="Catalog products" value={String(catalog.length)} sub={`${brackets.length} tax brackets`} />
      </div>

      {pendingSuppliers.length > 0 ? (
        <section className="card p-5">
          <h2 className="text-base font-semibold text-ink">Suppliers awaiting review</h2>
          <ul className="mt-3 divide-y divide-line">
            {pendingSuppliers.map((supplier) => (
              <li key={supplier.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{supplier.name}</p>
                  <p className="text-xs text-muted">{supplier.summary}</p>
                </div>
                <Link href="/admin/suppliers" className="btn-secondary btn-sm">
                  Review
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card p-5">
        <h2 className="text-base font-semibold text-ink">Stores across the platform</h2>
        <p className="mt-1 text-sm text-muted">
          Platform administrators can see that a store exists and who operates it. Order and customer records
          stay with the store team.
        </p>
        <div className="mt-4 relative overflow-x-auto">
          <table className="w-full min-w-[42rem] text-left text-sm">
            <thead className="text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="py-2 pr-3">Store</th>
                <th scope="col" className="py-2 pr-3">Agency</th>
                <th scope="col" className="py-2 pr-3">Currencies</th>
                <th scope="col" className="py-2 pr-3">Payments</th>
                <th scope="col" className="py-2 pr-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {stores.map((store) => (
                <tr key={store.id}>
                  <td className="py-2.5 pr-3">
                    <Link href={`/app/stores/${store.id}`} className="font-medium text-ink hover:underline">
                      {store.name}
                    </Link>
                    <p className="text-xs text-muted">{store.clientName}</p>
                  </td>
                  <td className="py-2.5 pr-3 text-inksoft">
                    {agencies.find((a) => a.id === store.agencyId)?.name ?? "—"}
                  </td>
                  <td className="py-2.5 pr-3 text-inksoft">{store.currencies.join(", ")}</td>
                  <td className="py-2.5 pr-3">
                    <Badge tone={store.stripe.connected ? "green" : "amber"}>
                      {store.stripe.connected ? "Stripe connected" : "Not connected"}
                    </Badge>
                  </td>
                  <td className="py-2.5 pr-3">
                    <Badge tone={store.status === "active" ? "green" : "slate"}>{store.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">Recent platform activity</h2>
          <Link href="/admin/audit" className="text-sm font-medium text-brand-700 hover:underline">
            Full audit log
          </Link>
        </div>
        <ol className="mt-3 divide-y divide-line text-sm">
          {audit.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
              <span className="text-ink">{entry.summary}</span>
              <span className="text-xs text-muted">
                {entry.actorName} · {formatDateTime(entry.at)}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

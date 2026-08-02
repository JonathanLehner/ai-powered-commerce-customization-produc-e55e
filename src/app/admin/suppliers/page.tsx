import { setSupplierStatus } from "@/app/actions/admin";
import { Badge, Callout, PageHeader } from "@/components/ui";
import { listCatalogProducts, listSuppliers } from "@/lib/data";
import { AddSupplierForm, SupplierRegionsForm } from "./SupplierForms";

const CAPABILITY_LABELS: Record<string, string> = {
  catalog: "Catalog",
  quotes: "Quotes",
  inventory: "Inventory",
  mockups: "Mockups",
  orderSubmission: "Order API",
  tracking: "Tracking",
  cancellation: "Cancellation",
};

export default async function AdminSuppliersPage() {
  const [suppliers, catalog] = await Promise.all([listSuppliers(), listCatalogProducts()]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approved production partners"
        description="Only approved suppliers appear in store sourcing. Capabilities decide whether a paid order can be routed automatically or must be raised by hand."
      />

      <Callout tone="neutral" title="Why some partners are manual">
        Print-on-demand networks expose documented order and tracking APIs. Sourcing marketplaces such as
        Alibaba.com do not offer a single transactional API across their suppliers, so those orders are flagged
        for a buyer to confirm specification, minimum order quantity and Trade Assurance terms.
      </Callout>

      <ul className="space-y-4">
        {suppliers.map((supplier) => {
          const products = catalog.filter((c) => c.supplierId === supplier.id);
          return (
            <li key={supplier.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-ink">{supplier.name}</h2>
                    <Badge
                      tone={
                        supplier.status === "approved" ? "green" : supplier.status === "disabled" ? "rose" : "amber"
                      }
                    >
                      {supplier.status.replace("_", " ")}
                    </Badge>
                    <Badge tone="neutral">{supplier.integration === "api" ? "Order API" : "Manual orders"}</Badge>
                    <Badge tone="neutral">{supplier.kind.replace(/_/g, " ")}</Badge>
                  </div>
                  <p className="mt-2 max-w-3xl text-sm text-inksoft">{supplier.summary}</p>
                  <p className="mt-2 text-xs text-muted">
                    <a href={supplier.website} target="_blank" rel="noreferrer" className="hover:underline">
                      {supplier.website.replace("https://", "")} ↗
                    </a>{" "}
                    · lead time {supplier.leadTimeDays[0]}–{supplier.leadTimeDays[1]} days · {products.length}{" "}
                    catalog products
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {supplier.status !== "approved" ? (
                    <form action={setSupplierStatus}>
                      <input type="hidden" name="supplierId" value={supplier.id} />
                      <input type="hidden" name="status" value="approved" />
                      <button type="submit" className="btn-primary btn-sm">
                        Approve
                      </button>
                    </form>
                  ) : null}
                  {supplier.status !== "pending_review" ? (
                    <form action={setSupplierStatus}>
                      <input type="hidden" name="supplierId" value={supplier.id} />
                      <input type="hidden" name="status" value="pending_review" />
                      <button type="submit" className="btn-secondary btn-sm">
                        Return to review
                      </button>
                    </form>
                  ) : null}
                  {supplier.status !== "disabled" ? (
                    <form action={setSupplierStatus}>
                      <input type="hidden" name="supplierId" value={supplier.id} />
                      <input type="hidden" name="status" value="disabled" />
                      <button type="submit" className="btn-danger btn-sm">
                        Disable
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>

              <ul className="mt-4 flex flex-wrap gap-1.5">
                {Object.entries(supplier.capabilities).map(([key, value]) => (
                  <li key={key}>
                    <Badge tone={value ? "green" : "slate"}>
                      {value ? "✓" : "✕"} {CAPABILITY_LABELS[key] ?? key}
                    </Badge>
                  </li>
                ))}
              </ul>

              <div className="mt-5 border-t border-line pt-4">
                <SupplierRegionsForm supplier={supplier} />
              </div>
            </li>
          );
        })}
      </ul>

      <AddSupplierForm />
    </div>
  );
}

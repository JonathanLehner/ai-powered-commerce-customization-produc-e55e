import Link from "next/link";
import { setSupplierStatus } from "@/app/actions/admin";
import { Badge, Callout, PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
        Alibaba.com do not offer a single transactional API across their suppliers, so their listings are
        priced by quote and those orders are flagged for a buyer to confirm specification, minimum order
        quantity and Trade Assurance terms. Requests stores raise sit in the{" "}
        <Link href="/admin/quotes" className="font-medium underline underline-offset-2">
          quote queue
        </Link>
        .
      </Callout>

      <ul className="space-y-4">
        {suppliers.map((supplier) => {
          const products = catalog.filter((c) => c.supplierId === supplier.id);
          return (
            <Card asChild key={supplier.id}>
            <li>
              <CardHeader className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle asChild>
                      <h2>{supplier.name}</h2>
                    </CardTitle>
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
                  <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{supplier.summary}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    <a href={supplier.website} target="_blank" rel="noreferrer" className="hover:underline">
                      {supplier.website.replace("https://", "")} ↗
                    </a>{" "}
                    · lead time {supplier.leadTimeDays[0]}–{supplier.leadTimeDays[1]} days · {products.length}{" "}
                    catalog products
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {supplier.kind === "sourcing_marketplace" ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href="/admin/quotes">Quote requests</Link>
                    </Button>
                  ) : null}
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/admin/catalog/new?supplierId=${supplier.id}`}>Add catalog product</Link>
                  </Button>
                  {supplier.status !== "approved" ? (
                    <form action={setSupplierStatus}>
                      <input type="hidden" name="supplierId" value={supplier.id} />
                      <input type="hidden" name="status" value="approved" />
                      <Button type="submit" size="sm">
                        Approve
                      </Button>
                    </form>
                  ) : null}
                  {supplier.status !== "pending_review" ? (
                    <form action={setSupplierStatus}>
                      <input type="hidden" name="supplierId" value={supplier.id} />
                      <input type="hidden" name="status" value="pending_review" />
                      <Button type="submit" variant="outline" size="sm">
                        Return to review
                      </Button>
                    </form>
                  ) : null}
                  {supplier.status !== "disabled" ? (
                    <form action={setSupplierStatus}>
                      <input type="hidden" name="supplierId" value={supplier.id} />
                      <input type="hidden" name="status" value="disabled" />
                      <Button type="submit" variant="destructive" size="sm">
                        Disable
                      </Button>
                    </form>
                  ) : null}
                </div>
              </CardHeader>

              <CardContent>
                <ul className="flex flex-wrap gap-1.5">
                  {Object.entries(supplier.capabilities).map(([key, value]) => (
                    <li key={key}>
                      <Badge tone={value ? "green" : "slate"}>
                        {value ? "✓" : "✕"} {CAPABILITY_LABELS[key] ?? key}
                      </Badge>
                    </li>
                  ))}
                </ul>

                <Separator className="my-4" />
                <SupplierRegionsForm supplier={supplier} />
              </CardContent>
            </li>
            </Card>
          );
        })}
      </ul>

      <AddSupplierForm />
    </div>
  );
}

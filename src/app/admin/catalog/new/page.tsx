import { Breadcrumbs, Callout, PageHeader } from "@/components/ui";
import { listSuppliers } from "@/lib/data";
import { CatalogProductForm } from "../CatalogProductForm";

export default async function AdminCatalogNewPage({
  searchParams,
}: {
  searchParams: Promise<{ supplierId?: string }>;
}) {
  const [{ supplierId }, suppliers] = await Promise.all([searchParams, listSuppliers()]);
  const preselected = suppliers.find((s) => s.id === supplierId);

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Shared catalog", href: "/admin/catalog" },
          { label: "New product" },
        ]}
      />
      <PageHeader
        title="Add a catalog product"
      />

      {preselected ? (
        <Callout tone="neutral" title={`Adding a product for ${preselected.name}`}>
          {preselected.status === "approved"
            ? "Stores can import it once it is active."
            : "Stores can import it once this supplier is approved."}
        </Callout>
      ) : null}

      <div className="max-w-4xl">
        <CatalogProductForm suppliers={suppliers} defaultSupplierId={supplierId} />
      </div>
    </div>
  );
}

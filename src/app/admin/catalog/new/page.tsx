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
        description="Everything set here is inherited by every store that imports the product: costs, print areas, variants and the regions it can be fulfilled to."
      />

      {preselected ? (
        <Callout tone="neutral" title={`Adding a product for ${preselected.name}`}>
          {preselected.status === "approved"
            ? "This partner is approved, so stores can import the product as soon as it is active."
            : "This partner is not approved yet. The product can be prepared now, but stores only see it once the supplier is approved."}
        </Callout>
      ) : null}

      <div className="max-w-4xl">
        <CatalogProductForm suppliers={suppliers} defaultSupplierId={supplierId} />
      </div>
    </div>
  );
}

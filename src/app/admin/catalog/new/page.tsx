import { getTranslations } from "next-intl/server";
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

  const [pages, t] = await Promise.all([getTranslations("pages.admin"), getTranslations("admin.catalog")]);
  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: t("sharedCatalog"), href: "/admin/catalog" },
          { label: t("newProduct") },
        ]}
      />
      <PageHeader
        title={pages("newCatalogTitle")}
      />

      {preselected ? (
        <Callout tone="neutral" title={t("addingFor", { supplier: preselected.name })}>
          {preselected.status === "approved" ? t("importWhenActive") : t("importWhenApproved")}
        </Callout>
      ) : null}

      <div className="max-w-4xl">
        <CatalogProductForm suppliers={suppliers} defaultSupplierId={supplierId} />
      </div>
    </div>
  );
}

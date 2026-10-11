import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { setSupplierStatus } from "@/app/actions/admin";
import { Badge, PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { listCatalogProducts, listSuppliers } from "@/lib/data";
import { AddSupplierForm, SupplierRegionsForm } from "./SupplierForms";

export default async function AdminSuppliersPage() {
  const [suppliers, catalog] = await Promise.all([listSuppliers(), listCatalogProducts()]);

  const [pages, t, labels] = await Promise.all([
    getTranslations("pages.admin"),
    getTranslations("admin.suppliers"),
    getTranslations("labels"),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        title={pages("suppliersTitle")}
        description={pages("suppliersDescription")}
      />


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
                      {labels(`supplierStatus.${supplier.status}`)}
                    </Badge>
                    <Badge tone="neutral">{supplier.integration === "api" ? t("orderApi") : t("manualOrders")}</Badge>
                    <Badge tone="neutral">{labels(`supplierKind.${supplier.kind}`)}</Badge>
                  </div>
                  <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{supplier.summary}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    <a href={supplier.website} target="_blank" rel="noreferrer" className="hover:underline">
                      {supplier.website.replace("https://", "")} ↗
                    </a>{" "}
                    ·{" "}
                    {t("meta", {
                      min: supplier.leadTimeDays[0],
                      max: supplier.leadTimeDays[1],
                      count: products.length,
                    })}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {supplier.kind === "sourcing_marketplace" ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href="/admin/quotes">{t("quoteRequests")}</Link>
                    </Button>
                  ) : null}
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/admin/catalog/new?supplierId=${supplier.id}`}>{t("addProduct")}</Link>
                  </Button>
                  {supplier.status !== "approved" ? (
                    <form action={setSupplierStatus}>
                      <input type="hidden" name="supplierId" value={supplier.id} />
                      <input type="hidden" name="status" value="approved" />
                      <Button type="submit" size="sm">
                        {t("approve")}
                      </Button>
                    </form>
                  ) : null}
                  {supplier.status !== "pending_review" ? (
                    <form action={setSupplierStatus}>
                      <input type="hidden" name="supplierId" value={supplier.id} />
                      <input type="hidden" name="status" value="pending_review" />
                      <Button type="submit" variant="outline" size="sm">
                        {t("returnToReview")}
                      </Button>
                    </form>
                  ) : null}
                  {supplier.status !== "disabled" ? (
                    <form action={setSupplierStatus}>
                      <input type="hidden" name="supplierId" value={supplier.id} />
                      <input type="hidden" name="status" value="disabled" />
                      <Button type="submit" variant="destructive" size="sm">
                        {t("disable")}
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
                        {value ? "✓" : "✕"} {t.has(`capability.${key}` as "capability.catalog") ? t(`capability.${key}` as "capability.catalog") : key}
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

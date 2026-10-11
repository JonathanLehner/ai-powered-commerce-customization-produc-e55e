import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { Badge, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listCatalogProducts, listSuppliers } from "@/lib/data";
import { isQuoteOnly } from "@/lib/sourcing";
import { formatMoney } from "@/lib/util";

export default async function AdminCatalogPage() {
  const [catalog, suppliers] = await Promise.all([listCatalogProducts(), listSuppliers()]);
  const [pages, t, labels, locale] = await Promise.all([
    getTranslations("pages.admin"),
    getTranslations("admin.catalog"),
    getTranslations("labels"),
    getLocale(),
  ]);
  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? t("unknown");
  return (
    <div className="space-y-6">
      <PageHeader
        title={pages("catalogTitle")}
        description={pages("catalogDescription")}
        actions={
          <Button asChild size="sm">
            <Link href="/admin/catalog/new">{t("addProduct")}</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("products")} value={String(catalog.length)} />
        <StatCard label={t("apparel")} value={String(catalog.filter((c) => c.category === "apparel").length)} />
        <StatCard label={t("drinkware")} value={String(catalog.filter((c) => c.category === "drinkware").length)} />
        <StatCard
          label={t("bulkSourcing")}
          value={String(catalog.filter((c) => isQuoteOnly(c)).length)}
          sub={t("pricedByQuote")}
        />
      </div>

      {catalog.length === 0 ? (
        <EmptyState
          title={t("noProducts")}
          description={t("noProductsBody")}
          action={
            <Button asChild>
              <Link href="/admin/catalog/new">{t("addProduct")}</Link>
            </Button>
          }
        />
      ) : null}

      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {catalog.map((product) => (
          <Card asChild key={product.id} className="gap-0 py-0">
          <li>
            {product.mockups[0] ? (
              <div className="border-b border-border bg-muted">
                <Image
                  src={product.mockups[0].url}
                  alt={product.name}
                  width={640}
                  height={640}
                  loading="lazy"
                  sizes="(min-width: 1280px) 380px, (min-width: 768px) 45vw, 90vw"
                  className="h-auto w-full object-cover"
                  style={{ aspectRatio: "1 / 1" }}
                />
              </div>
            ) : null}
            <CardContent className="flex flex-1 flex-col py-4">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-heading text-sm font-medium text-foreground">{product.name}</h2>
                <Badge tone={product.status === "active" ? "green" : "slate"}>{labels(`catalogStatus.${product.status}`)}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {supplierName(product.supplierId)} · {product.productType}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-2 border-y border-border py-3 text-xs">
                <div>
                  <dt className="text-muted-foreground">{t("baseCost")}</dt>
                  <dd className="font-semibold tabular-nums text-foreground">
                    {isQuoteOnly(product) ? t("byQuote") : formatMoney(product.baseCost, product.currency, locale)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{isQuoteOnly(product) ? t("minimumOrder") : t("perArea")}</dt>
                  <dd className="font-semibold tabular-nums text-foreground">
                    {isQuoteOnly(product)
                      ? t("units", { count: product.bulkSourcing.minimumOrderQuantity })
                      : formatMoney(product.customizationCostPerArea, product.currency, locale)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("variants")}</dt>
                  <dd className="font-semibold text-foreground">{product.variants.length}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("availability")}</dt>
                  <dd className="font-semibold text-foreground">{labels(`catalogAvailability.${product.availability}`)}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">
                {product.printAreas.map((a) => `${a.name} ${a.widthMm}×${a.heightMm} mm`).join(" · ")}
              </p>
              <div className="mt-auto pt-4">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/admin/catalog/${product.id}`}>{t("editProduct")}</Link>
                </Button>
              </div>
            </CardContent>
          </li>
          </Card>
        ))}
      </ul>
    </div>
  );
}

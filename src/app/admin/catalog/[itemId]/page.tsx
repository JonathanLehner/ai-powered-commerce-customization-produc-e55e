import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { AdminNotFoundView } from "@/components/NotFoundViews";
import { Badge, Breadcrumbs, Callout, DataList, PageHeader } from "@/components/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCatalogProduct, listSuppliers } from "@/lib/data";
import { isQuoteOnly } from "@/lib/sourcing";
import { formatMoney } from "@/lib/util";
import { CatalogProductForm } from "../CatalogProductForm";

export default async function AdminCatalogItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ itemId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const [{ itemId }, { created }] = await Promise.all([params, searchParams]);
  const item = await getCatalogProduct(itemId);
  if (!item) return <AdminNotFoundView />;
  const suppliers = await listSuppliers();
  const supplier = suppliers.find((s) => s.id === item.supplierId) ?? null;
  const [t, catalogT, labels, locale] = await Promise.all([
    getTranslations("admin.catalogItem"),
    getTranslations("admin.catalog"),
    getTranslations("labels"),
    getLocale(),
  ]);

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: catalogT("sharedCatalog"), href: "/admin/catalog" },
          { label: item.name },
        ]}
      />
      <PageHeader
        title={item.name}
        description={`${supplier ? `${supplier.name} · ` : ""}${t("description", {
          type: item.productType,
          variants: item.variants.length,
          areas: item.printAreas.length,
        })}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isQuoteOnly(item) ? <Badge tone="iris">{catalogT("byQuote")}</Badge> : null}
            <Badge tone={item.status === "active" ? "green" : "slate"}>{labels(`catalogStatus.${item.status}`)}</Badge>
          </div>
        }
      />

      {created ? (
        <Callout tone="green" title={t("addedTitle")}>
          {t("addedBody")}
        </Callout>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="order-2 lg:order-1">
          {isQuoteOnly(item) ? (
            <Card asChild>
            <section>
              <CardHeader>
                <CardTitle asChild>
                  <h2 className="text-sm">{t("pricedByQuote")}</h2>
                </CardTitle>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  {t("bulkBody")}
                </p>
              </CardHeader>
              <CardContent>
                <DataList
                  rows={[
                    {
                      label: t("minimumOrder"),
                      value: catalogT("units", { count: item.bulkSourcing.minimumOrderQuantity }),
                    },
                    {
                      label: t("indicative"),
                      value: t("indicativeValue", {
                        low: formatMoney(item.bulkSourcing.indicativeUnitCost[0], item.currency, locale),
                        high: formatMoney(item.bulkSourcing.indicativeUnitCost[1], item.currency, locale),
                        quantity: catalogT("units", { count: item.bulkSourcing.minimumOrderQuantity }),
                      }),
                    },
                    {
                      label: t("response"),
                      value: t("responseDays", {
                        min: item.bulkSourcing.responseDays[0],
                        max: item.bulkSourcing.responseDays[1],
                      }),
                    },
                    { label: t("terms"), value: item.bulkSourcing.quoteNotes },
                  ]}
                />
                                <p className="mt-4 text-sm">
                  <Link href="/admin/quotes" className="font-medium underline underline-offset-2">
                    {t("viewQuotes")}
                  </Link>
                </p>
              </CardContent>
            </section>
            </Card>
          ) : (
            <CatalogProductForm item={item} suppliers={suppliers} />
          )}
        </div>

        <aside className="order-1 space-y-5 lg:order-2">
          <Card asChild>
          <section>
            <CardHeader>
              <CardTitle asChild>
                <h2 className="text-sm">{t("photography")}</h2>
              </CardTitle>
              {item.mockups.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("noPhotography")}
                </p>
              ) : null}
            </CardHeader>
            <CardContent>
            <ul className="grid grid-cols-2 gap-3">
              {item.mockups.map((mockup) => (
                <li key={`${mockup.view}-${mockup.colour}`} className="overflow-hidden rounded-lg border border-border">
                  <Image
                    src={mockup.url}
                    alt={t("photoAlt", { name: item.name, view: labels(`view.${mockup.view}`), colour: mockup.colour })}
                    width={320}
                    height={320}
                    loading="lazy"
                    sizes="160px"
                    className="h-auto w-full bg-muted object-cover"
                    style={{ aspectRatio: "1 / 1" }}
                  />
                  <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
                    {labels(`view.${mockup.view}`)} · {mockup.colour}
                  </p>
                </li>
              ))}
            </ul>
            </CardContent>
          </section>
          </Card>

          <Card asChild>
          <section>
            <CardHeader>
              <CardTitle asChild>
                <h2 className="text-sm">{t("fileRequirements")}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
            <DataList
              rows={[
                { label: t("formats"), value: item.fileRequirements.formats.join(", ") },
                { label: t("maxSize"), value: `${item.fileRequirements.maxFileMb} MB` },
                { label: t("minDpi"), value: `${item.fileRequirements.minDpi}` },
                {
                  label: t("megapixels"),
                  value: `${(item.fileRequirements.maxPixels / 1_000_000).toFixed(0)} MP`,
                },
                {
                  label: t("transparency"),
                  value: item.fileRequirements.transparentBackgroundRequired ? t("required") : t("optional"),
                },
              ]}
            />
            </CardContent>
          </section>
          </Card>

          <Card asChild>
          <section>
            <CardHeader>
              <CardTitle asChild>
                <h2 className="text-sm">{t("production")}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
            <DataList
              rows={[
                { label: t("supplier"), value: supplier?.name ?? labels("none") },
                { label: t("integration"), value: supplier?.integration === "api" ? t("orderApi") : t("manual") },
                { label: t("leadTime"), value: t("days", { min: item.leadTimeDays[0], max: item.leadTimeDays[1] }) },
                { label: t("currency"), value: item.currency },
              ]}
            />
            </CardContent>
          </section>
          </Card>
        </aside>
      </div>
    </div>
  );
}

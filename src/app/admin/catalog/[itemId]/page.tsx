import Image from "next/image";
import Link from "next/link";
import { AdminNotFoundView } from "@/components/NotFoundViews";
import { Badge, Breadcrumbs, Callout, DataList, PageHeader } from "@/components/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCatalogProduct, listSuppliers } from "@/lib/data";
import { formatQuantity, indicativeRange, isQuoteOnly, QUOTE_PRICE_LABEL } from "@/lib/sourcing";
import { VIEW_LABELS } from "@/lib/types";
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

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Shared catalog", href: "/admin/catalog" },
          { label: item.name },
        ]}
      />
      <PageHeader
        title={item.name}
        description={`${supplier ? `${supplier.name} · ` : ""}${item.productType} · ${item.variants.length} variants · ${item.printAreas.length} print areas`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isQuoteOnly(item) ? <Badge tone="iris">{QUOTE_PRICE_LABEL}</Badge> : null}
            <Badge tone={item.status === "active" ? "green" : "slate"}>{item.status}</Badge>
          </div>
        }
      />

      {created ? (
        <Callout tone="green" title="Product added to the shared catalog">
          Stores can import it while it is active. Add supplier photography with the supplier’s own imagery so
          imported products can render mockups before they are published.
        </Callout>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="order-2 lg:order-1">
          {isQuoteOnly(item) ? (
            <Card asChild>
            <section>
              <CardHeader>
                <CardTitle asChild>
                  <h2 className="text-sm">Priced by quote</h2>
                </CardTitle>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  This is a bulk-sourcing listing, so it carries no unit cost, no per-area customisation charge
                  and no shipping estimate: a factory prices each run against the specification the store sends.
                  The cost editor does not apply to it, and a price entered here would be one no supplier has
                  given.
                </p>
              </CardHeader>
              <CardContent>
                <DataList
                  rows={[
                    {
                      label: "Minimum order",
                      value: formatQuantity(item.bulkSourcing.minimumOrderQuantity),
                    },
                    { label: "Indicative", value: indicativeRange(item) },
                    {
                      label: "Supplier response",
                      value: `${item.bulkSourcing.responseDays[0]}–${item.bulkSourcing.responseDays[1]} working days`,
                    },
                    { label: "Terms shown to buyers", value: item.bulkSourcing.quoteNotes },
                  ]}
                />
                <p className="mt-4 text-sm text-muted-foreground">
                  Requests raised against it, and the prices recorded back, sit in the{" "}
                  <Link href="/admin/quotes" className="font-medium underline underline-offset-2">
                    quote queue
                  </Link>
                  .
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
                <h2 className="text-sm">Supplier photography</h2>
              </CardTitle>
              {item.mockups.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  None yet. Costs, print areas and variants all work without it, but a store cannot generate or
                  approve mockups until this product has photography for each print area’s view.
                </p>
              ) : null}
            </CardHeader>
            <CardContent>
            <ul className="grid grid-cols-2 gap-3">
              {item.mockups.map((mockup) => (
                <li key={`${mockup.view}-${mockup.colour}`} className="overflow-hidden rounded-lg border border-border">
                  <Image
                    src={mockup.url}
                    alt={`${item.name}, ${VIEW_LABELS[mockup.view]}, ${mockup.colour}`}
                    width={320}
                    height={320}
                    loading="lazy"
                    sizes="160px"
                    className="h-auto w-full bg-muted object-cover"
                    style={{ aspectRatio: "1 / 1" }}
                  />
                  <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
                    {VIEW_LABELS[mockup.view]} · {mockup.colour}
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
                <h2 className="text-sm">File requirements</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
            <DataList
              rows={[
                { label: "Formats", value: item.fileRequirements.formats.join(", ") },
                { label: "Maximum size", value: `${item.fileRequirements.maxFileMb} MB` },
                { label: "Minimum DPI", value: `${item.fileRequirements.minDpi}` },
                {
                  label: "Megapixel ceiling",
                  value: `${(item.fileRequirements.maxPixels / 1_000_000).toFixed(0)} MP`,
                },
                {
                  label: "Transparency",
                  value: item.fileRequirements.transparentBackgroundRequired ? "Required" : "Optional",
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
                <h2 className="text-sm">Production</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
            <DataList
              rows={[
                { label: "Supplier", value: supplier?.name ?? "—" },
                { label: "Integration", value: supplier?.integration === "api" ? "Order API" : "Manual" },
                { label: "Lead time", value: `${item.leadTimeDays[0]}–${item.leadTimeDays[1]} days` },
                { label: "Currency", value: item.currency },
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

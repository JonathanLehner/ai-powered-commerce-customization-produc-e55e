import Image from "next/image";
import { notFound } from "next/navigation";
import { Badge, Breadcrumbs, DataList, PageHeader } from "@/components/ui";
import { getCatalogProduct, getSupplier } from "@/lib/data";
import { VIEW_LABELS } from "@/lib/types";
import { CatalogItemForm } from "./CatalogItemForm";

export default async function AdminCatalogItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const item = await getCatalogProduct(itemId);
  if (!item) notFound();
  const supplier = await getSupplier(item.supplierId);

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Shared catalog", href: "/admin/catalog" },
          { label: item.name },
        ]}
      />
      <PageHeader
        eyebrow={supplier ? supplier.name : "Supplier product"}
        title={item.name}
        description={`${item.productType} · ${item.variants.length} variants · ${item.printAreas.length} print areas`}
        actions={<Badge tone={item.status === "active" ? "green" : "slate"}>{item.status}</Badge>}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="order-2 lg:order-1">
          <CatalogItemForm item={item} />
        </div>

        <aside className="order-1 space-y-5 lg:order-2">
          <section className="card p-5">
            <h2 className="text-sm font-semibold text-ink">Supplier photography</h2>
            <ul className="mt-3 grid grid-cols-2 gap-3">
              {item.mockups.map((mockup) => (
                <li key={`${mockup.view}-${mockup.colour}`} className="overflow-hidden rounded-lg border border-line">
                  <Image
                    src={mockup.url}
                    alt={`${item.name}, ${VIEW_LABELS[mockup.view]}, ${mockup.colour}`}
                    width={320}
                    height={320}
                    loading="lazy"
                    sizes="160px"
                    className="h-auto w-full bg-canvas object-cover"
                    style={{ aspectRatio: "1 / 1" }}
                  />
                  <p className="px-2 py-1.5 text-[11px] text-muted">
                    {VIEW_LABELS[mockup.view]} · {mockup.colour}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-5">
            <h2 className="text-sm font-semibold text-ink">File requirements</h2>
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
          </section>

          <section className="card p-5">
            <h2 className="text-sm font-semibold text-ink">Production</h2>
            <DataList
              rows={[
                { label: "Supplier", value: supplier?.name ?? "—" },
                { label: "Integration", value: supplier?.integration === "api" ? "Order API" : "Manual" },
                { label: "Lead time", value: `${item.leadTimeDays[0]}–${item.leadTimeDays[1]} days` },
                { label: "Currency", value: item.currency },
              ]}
            />
          </section>
        </aside>
      </div>
    </div>
  );
}

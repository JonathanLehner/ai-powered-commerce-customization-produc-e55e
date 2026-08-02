import Image from "next/image";
import Link from "next/link";
import { Badge, PageHeader, StatCard } from "@/components/ui";
import { listCatalogProducts, listSuppliers } from "@/lib/data";
import { formatMoney } from "@/lib/util";

export default async function AdminCatalogPage() {
  const [catalog, suppliers] = await Promise.all([listCatalogProducts(), listSuppliers()]);
  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? "Unknown";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Supplier-backed products"
        description="Apparel and drinkware every store can copy from. Base costs, print areas, availability and fulfilment regions are set here and inherited on import."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Products" value={String(catalog.length)} />
        <StatCard label="Apparel" value={String(catalog.filter((c) => c.category === "apparel").length)} />
        <StatCard label="Drinkware" value={String(catalog.filter((c) => c.category === "drinkware").length)} />
        <StatCard
          label="Print areas"
          value={String(catalog.reduce((sum, c) => sum + c.printAreas.length, 0))}
          sub="Defined in millimetres"
        />
      </div>

      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {catalog.map((product) => (
          <li key={product.id} className="card flex flex-col overflow-hidden">
            {product.mockups[0] ? (
              <div className="border-b border-line bg-canvas">
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
            <div className="flex flex-1 flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-sm font-semibold text-ink">{product.name}</h2>
                <Badge tone={product.status === "active" ? "green" : "slate"}>{product.status}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted">
                {supplierName(product.supplierId)} · {product.productType}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-2 border-y border-line py-3 text-xs">
                <div>
                  <dt className="text-muted">Base cost</dt>
                  <dd className="font-semibold tabular-nums text-ink">
                    {formatMoney(product.baseCost, product.currency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Per print area</dt>
                  <dd className="font-semibold tabular-nums text-ink">
                    {formatMoney(product.customizationCostPerArea, product.currency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Variants</dt>
                  <dd className="font-semibold text-ink">{product.variants.length}</dd>
                </div>
                <div>
                  <dt className="text-muted">Availability</dt>
                  <dd className="font-semibold text-ink">{product.availability}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-muted">
                {product.printAreas.map((a) => `${a.name} ${a.widthMm}×${a.heightMm} mm`).join(" · ")}
              </p>
              <div className="mt-auto pt-4">
                <Link href={`/admin/catalog/${product.id}`} className="btn-secondary btn-sm">
                  Edit product
                </Link>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

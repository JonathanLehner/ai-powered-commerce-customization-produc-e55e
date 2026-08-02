import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readCurrency } from "@/app/actions/shop";
import { Badge, Breadcrumbs } from "@/components/ui";
import { getCatalogProduct, getStoreBySlug, getStoreProductBySlug, getSupplier } from "@/lib/data";
import { convert } from "@/lib/pricing";
import { ProductPurchase, type PurchaseProduct } from "./ProductPurchase";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; productSlug: string }>;
}): Promise<Metadata> {
  const { slug, productSlug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) return { title: "Not found" };
  const product = await getStoreProductBySlug(store.id, productSlug);
  if (!product) return { title: "Not found" };
  return {
    title: `${product.name} — ${store.name}`,
    description: product.description.split("\n")[0].slice(0, 155),
  };
}

export default async function StorefrontProductPage({
  params,
}: {
  params: Promise<{ slug: string; productSlug: string }>;
}) {
  const { slug, productSlug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  const product = await getStoreProductBySlug(store.id, productSlug);
  if (!product || product.status !== "published") notFound();

  const [catalog, supplier] = await Promise.all([
    getCatalogProduct(product.catalogProductId),
    getSupplier(product.supplierId),
  ]);
  const currency = await readCurrency(store.defaultCurrency, store.currencies);
  const area = catalog?.printAreas[0] ?? null;

  const purchase: PurchaseProduct = {
    id: product.id,
    storeId: product.storeId,
    name: product.name,
    currency: product.currency,
    displayCurrency: currency,
    storeSlug: store.slug,
    variants: product.variants
      .filter((v) => v.enabled)
      .map((v) => ({
        id: v.id,
        name: v.name,
        colour: v.colour,
        colourHex: v.colourHex,
        size: v.size,
        price: convert(v.price, product.currency, currency),
        availability: v.availability,
      })),
    mockups: product.mockups.map((m) => ({ id: m.id, url: m.url, view: m.view })),
    shopperCustomization: product.shopperCustomization,
    printArea: area
      ? {
          name: area.name,
          widthMm: area.widthMm,
          heightMm: area.heightMm,
          minDpi: area.minDpi,
          rect: area.rect,
        }
      : null,
    fileRules: catalog
      ? {
          formats: catalog.fileRequirements.formats,
          maxFileMb: catalog.fileRequirements.maxFileMb,
          minDpi: catalog.fileRequirements.minDpi,
        }
      : null,
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Breadcrumbs
        items={[
          { label: store.name, href: `/s/${store.slug}` },
          { label: "Shop", href: `/s/${store.slug}/products` },
          { label: product.name },
        ]}
      />

      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{product.name}</h1>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {product.tags.map((tag) => (
          <Link key={tag} href={`/s/${store.slug}/products?tag=${encodeURIComponent(tag)}`}>
            <Badge tone="neutral">{tag}</Badge>
          </Link>
        ))}
      </div>

      <div className="mt-8">
        <ProductPurchase product={purchase} />
      </div>

      <div className="mt-12 grid gap-8 border-t border-line pt-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="text-lg font-semibold text-ink">About this product</h2>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-inksoft">
            {product.description.split("\n\n").map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </div>
        <aside className="space-y-4 text-sm">
          <div className="rounded-xl border border-line p-4">
            <h2 className="text-sm font-semibold text-ink">Made to order</h2>
            <p className="mt-1.5 text-muted">
              Produced by {supplier?.name ?? "our production partner"} in{" "}
              {catalog ? `${catalog.leadTimeDays[0]}–${catalog.leadTimeDays[1]} days` : "a few days"}, then
              shipped with{" "}
              {store.carriers
                .filter((c) => c.enabled)
                .map((c) => c.carrier.toUpperCase())
                .join(" or ") || "our carrier"}
              .
            </p>
          </div>
          {area ? (
            <div className="rounded-xl border border-line p-4">
              <h2 className="text-sm font-semibold text-ink">Print detail</h2>
              <p className="mt-1.5 text-muted">
                {area.name}, {area.widthMm} × {area.heightMm} mm, printed at a minimum of {area.minDpi} DPI.
              </p>
            </div>
          ) : null}
          <div className="rounded-xl border border-line p-4">
            <h2 className="text-sm font-semibold text-ink">Tax and delivery</h2>
            <p className="mt-1.5 text-muted">
              Prices shown in {currency}
              {store.pricesIncludeTax ? " with tax included" : "; tax is calculated at checkout"}.{" "}
              {store.clientName} is the merchant of record for this order.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

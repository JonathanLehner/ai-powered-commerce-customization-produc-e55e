import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readCurrency } from "@/app/actions/shop";
import { Badge, Breadcrumbs } from "@/components/ui";
import { isLive } from "@/lib/artwork";
import { getCatalogProduct, getStoreBySlug, getStoreProductBySlug, getSupplier } from "@/lib/data";
import { fmt, joinList, storefrontLocale } from "@/lib/i18n";
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
  if (!product || !isLive(product)) notFound();

  const [catalog, supplier] = await Promise.all([
    getCatalogProduct(product.catalogProductId),
    getSupplier(product.supplierId),
  ]);
  const currency = await readCurrency(store.defaultCurrency, store.currencies);
  const { t, tag: localeTag } = storefrontLocale(store);
  const area = catalog?.printAreas[0] ?? null;
  const carriers = store.carriers.filter((c) => c.enabled).map((c) => c.carrier.toUpperCase());

  const purchase: PurchaseProduct = {
    id: product.id,
    storeId: product.storeId,
    name: product.name,
    currency: product.currency,
    displayCurrency: currency,
    storeSlug: store.slug,
    localeTag,
    t: t.purchase,
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
        label={t.product.breadcrumb}
        items={[
          { label: store.name, href: `/s/${store.slug}` },
          { label: t.product.breadcrumbShop, href: `/s/${store.slug}/products` },
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
          <h2 className="text-lg font-semibold text-ink">{t.product.about}</h2>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-inksoft">
            {product.description.split("\n\n").map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </div>
        <aside className="space-y-4 text-sm">
          <div className="rounded-xl border border-line p-4">
            <h2 className="text-sm font-semibold text-ink">{t.product.madeToOrder}</h2>
            <p className="mt-1.5 text-muted">
              {fmt(t.product.producedBy, {
                supplier: supplier?.name ?? t.product.defaultSupplier,
                lead: catalog
                  ? fmt(t.product.leadDays, {
                      from: catalog.leadTimeDays[0],
                      to: catalog.leadTimeDays[1],
                    })
                  : t.product.leadUnknown,
                carriers:
                  carriers.length > 0
                    ? joinList(carriers, t.product.carrierJoin)
                    : t.product.defaultCarrier,
              })}
            </p>
          </div>
          {area ? (
            <div className="rounded-xl border border-line p-4">
              <h2 className="text-sm font-semibold text-ink">{t.product.printDetail}</h2>
              <p className="mt-1.5 text-muted">
                {fmt(t.product.printDetailBody, {
                  area: area.name,
                  width: area.widthMm,
                  height: area.heightMm,
                  dpi: area.minDpi,
                })}
              </p>
            </div>
          ) : null}
          <div className="rounded-xl border border-line p-4">
            <h2 className="text-sm font-semibold text-ink">{t.product.taxAndDelivery}</h2>
            <p className="mt-1.5 text-muted">
              {fmt(t.product.pricesShownIn, {
                currency,
                tax: store.pricesIncludeTax ? t.product.taxIncluded : t.product.taxAtCheckout,
              })}{" "}
              {fmt(t.product.merchantOfRecord, { client: store.clientName })}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { readCurrency } from "@/app/actions/shop";
import { notFoundRobots, UnknownStoreView } from "@/components/NotFoundViews";
import { StorefrontNotFoundView } from "@/components/ShopperNotFoundViews";
import { Badge, Breadcrumbs } from "@/components/ui";
import { isLive } from "@/lib/artwork";
import { JsonLd } from "@/components/JsonLd";
import { shopperIntl, shopperLocale } from "@/i18n/storefront";
import { getCatalogProduct, getStoreBySlug, getStoreProductBySlug } from "@/lib/data";
import { convert } from "@/lib/pricing";
import { breadcrumbJsonLd, metaDescription, productJsonLd, storeUrl } from "@/lib/seo";
import { storeSku } from "@/lib/sku";
import { shopperPageMetadata } from "@/lib/storefront-meta";
import { localizeProduct } from "@/lib/translations";
import { storeLanguages } from "@/i18n/storefront-routing";
import { Card, CardContent } from "@/components/ui/card";
import { ProductPurchase, type PurchaseProduct } from "./ProductPurchase";

const productPath = (slug: string) => `/products/${encodeURIComponent(slug)}`;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; locale: string; productSlug: string }>;
}): Promise<Metadata> {
  const { slug, locale, productSlug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) return { title: "Not found", ...notFoundRobots };
  const stored = await getStoreProductBySlug(store.id, productSlug);
  if (!stored || !isLive(stored)) return { title: "Not found", ...notFoundRobots };
  const active = shopperLocale(store, locale);
  const product = localizeProduct(stored, active, storeLanguages(store).defaultLocale);
  // The SEO title the store wrote is used as written; the product name gets
  // the store name after it like every other page.
  const seoTitle = product.seoTitle?.trim();
  return shopperPageMetadata(store, active, productPath(product.slug), {
    title: seoTitle || product.name,
    absolute: Boolean(seoTitle),
    description: product.seoDescription?.trim() || metaDescription(product.description),
    imagePath: productPath(product.slug),
  });
}

export default async function StorefrontProductPage({
  params,
}: {
  params: Promise<{ slug: string; locale: string; productSlug: string }>;
}) {
  const { slug, locale: requested, productSlug } = await params;
  const store = await getStoreBySlug(slug);
  // A slug that belongs to no store renders the "not this address" page in
  // Parcelith's own chrome, server-side, rather than raising notFound().
  if (!store) return <UnknownStoreView slug={slug} />;

  const stored = await getStoreProductBySlug(store.id, productSlug);
  // Taken off sale, or never existed: the store's own not-found page, in the
  // store's language and inside its header and footer.
  if (!stored || !isLive(stored)) return <StorefrontNotFoundView store={store} locale={requested} />;

  const catalog = await getCatalogProduct(stored.catalogProductId);
  const currency = await readCurrency(store.defaultCurrency, store.currencies);
  const { locale, t, base } = await shopperIntl(store, requested, `/s/${store.slug}`);
  // Name, description, colours and the personalisation label in the shopper's language.
  const product = localizeProduct(stored, locale, storeLanguages(store).defaultLocale);
  const area = catalog?.printAreas[0] ?? null;

  const purchase: PurchaseProduct = {
    id: product.id,
    storeId: product.storeId,
    name: product.name,
    currency: product.currency,
    displayCurrency: currency,
    base,
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
    mockups: product.mockups.map((m) => ({ id: m.id, url: m.url, view: m.view, colour: m.colour })),
    shopperCustomization: product.shopperCustomization,
    printArea: area,
    // The whole requirements record, not a summary: the storefront runs the
    // same pre-flight the workspace configurator does.
    fileRules: catalog?.fileRequirements ?? null,
  };

  const url = storeUrl(store, locale, productPath(product.slug));
  const enabled = product.variants.filter((v) => v.enabled);
  const structured = [
    productJsonLd({
      name: product.name,
      description: product.description.trim(),
      url,
      sku: storeSku(product, store.channelCode),
      brand: store.name,
      images: product.mockups.map((m) => m.url),
      currency: product.currency,
      variants: enabled.length > 0 ? enabled : [{ price: product.price, availability: "out_of_stock" as const }],
    }),
    breadcrumbJsonLd([
      { name: store.name, url: storeUrl(store, locale) },
      { name: t("product.breadcrumbShop"), url: storeUrl(store, locale, "/products") },
      { name: product.name, url },
    ]),
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 max-lg:pb-28 sm:px-6">
      <JsonLd data={structured} />
      <Breadcrumbs
        label={t("product.breadcrumb")}
        items={[
          { label: store.name, href: base },
          { label: t("product.breadcrumbShop"), href: `${base}/products` },
          { label: product.name },
        ]}
      />

      <ProductPurchase
        product={purchase}
        heading={
          <>
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {product.name}
            </h1>
            {product.tags.length > 0 ? (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {product.tags.map((item) => (
                  <Link key={item} href={`${base}/products?tag=${encodeURIComponent(item)}`}>
                    <Badge tone="neutral">{item}</Badge>
                  </Link>
                ))}
              </div>
            ) : null}
          </>
        }
      />

      <div className="mt-16 grid gap-10 border-t border-border pt-10 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">{t("product.about")}</h2>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-inksoft">
            {product.description.split("\n\n").map((paragraph, index) => (
              <p key={index} className="whitespace-pre-line">
                {paragraph}
              </p>
            ))}
          </div>
        </div>
        <aside className="space-y-3 text-sm">
          <Card size="sm">
            <CardContent>
              <h2 className="text-sm font-semibold text-foreground">{t("product.madeToOrder")}</h2>
              <p className="mt-1.5 text-muted-foreground">
                {t("product.producedBy", {
                  lead: catalog
                    ? t("product.leadDays", {
                        from: catalog.leadTimeDays[0],
                        to: catalog.leadTimeDays[1],
                      })
                    : t("product.leadUnknown"),
                })}
              </p>
            </CardContent>
          </Card>
          {area ? (
            <Card size="sm">
              <CardContent>
                <h2 className="text-sm font-semibold text-foreground">{t("product.printDetail")}</h2>
                <p className="mt-1.5 text-muted-foreground">
                  {t("product.printDetailBody", {
                    area: area.name,
                    width: area.widthMm,
                    height: area.heightMm,
                  })}
                </p>
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

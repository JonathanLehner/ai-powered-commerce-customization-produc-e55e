import type { Metadata } from "next";
import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { readCurrency } from "@/app/actions/shop";
import { notFoundRobots, UnknownStoreView } from "@/components/NotFoundViews";
import { ProductTile, ProductTileGrid } from "@/components/ProductTiles";
import { Badge, EmptyState } from "@/components/ui";
import { getTranslations } from "next-intl/server";
import { JsonLd } from "@/components/JsonLd";
import { shopperIntl, shopperLocale } from "@/i18n/storefront";
import { breadcrumbJsonLd, storeUrl } from "@/lib/seo";
import { shopperPageMetadata } from "@/lib/storefront-meta";
import { storeLanguages } from "@/i18n/storefront-routing";
import { localizeProduct } from "@/lib/translations";
import { publishedProducts, storefrontBySlug } from "@/lib/storefront-data";
import { presentmentPrice } from "@/lib/currency";
import { soldOutProducts } from "@/lib/inventory";
import { Button, buttonVariants } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}): Promise<Metadata> {
  const { slug, locale } = await params;
  const store = (await storefrontBySlug(slug))?.store ?? null;
  if (!store) return { title: "Shop", ...notFoundRobots };
  const active = shopperLocale(store, locale);
  const t = await getTranslations({ locale: active, namespace: "storefront.meta" });
  // The store name is the title suffix the layout adds, so the tab reads
  // "Shop · Northwind Supply Co" rather than naming the store twice.
  return shopperPageMetadata(store, active, "/products", {
    title: t("shopTitle"),
    description: t("shopDescription", { store: store.name }),
  });
}

export default async function StorefrontProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; locale: string }>;
  searchParams: Promise<{ q?: string; tag?: string }>;
}) {
  const { slug, locale: requested } = await params;
  const { q, tag } = await searchParams;
  const store = (await storefrontBySlug(slug))?.store ?? null;
  // A slug that belongs to no store renders the "not this address" page in
  // Parcelith's own chrome, server-side, rather than raising notFound().
  if (!store) return <UnknownStoreView slug={slug} />;

  const stored = await publishedProducts(store.id);
  const [currency, soldOut] = await Promise.all([
    readCurrency(store.defaultCurrency, store.currencies),
    soldOutProducts(stored),
  ]);
  const { locale, t, money, base } = await shopperIntl(store, requested, `/s/${store.slug}`);
  const products = stored.map((p) => localizeProduct(p, locale, storeLanguages(store).defaultLocale));
  const tags = [...new Set(products.flatMap((p) => p.tags))].sort((a, b) => a.localeCompare(b, locale));

  const visible = products
    .filter((p) => (tag ? p.tags.includes(tag) : true))
    .filter((p) =>
      q ? `${p.name} ${p.description} ${p.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase()) : true,
    );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: store.name, url: storeUrl(store, locale) },
          { name: t("shop.title"), url: storeUrl(store, locale, "/products") },
        ])}
      />
      <header className="max-w-2xl">
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {t("shop.title")}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-inksoft">
          {t("shop.intro", {
            currency,
            tax: store.pricesIncludeTax ? t("shop.taxIncluded") : t("shop.taxAtCheckout"),
          })}
        </p>
      </header>

      <form method="get" className="mt-8 flex flex-wrap items-center gap-2">
        <Label htmlFor="q" className="sr-only">
          {t("shop.searchLabel")}
        </Label>
        <div className="min-w-[14rem] flex-1">
          <InputGroup className="h-9">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              id="q"
              name="q"
              defaultValue={q ?? ""}
              placeholder={t("shop.searchPlaceholder")}
            />
          </InputGroup>
        </div>
        {tag ? <input type="hidden" name="tag" value={tag} /> : null}
        <Button type="submit" variant="outline" size="lg">
          {t("shop.searchSubmit")}
        </Button>
        {q || tag ? (
          <Link
            href={`${base}/products`}
            className={buttonVariants({ variant: "ghost", size: "lg" })}
          >
            {t("shop.clear")}
          </Link>
        ) : null}
      </form>

      {tags.length > 0 ? (
        <nav aria-label={t("shop.filterByTag")} className="mt-3 flex flex-wrap gap-2">
          {tags.slice(0, 12).map((item) => (
            <Link
              key={item}
              href={`${base}/products?tag=${encodeURIComponent(item)}`}
              className={buttonVariants({ variant: item === tag ? "default" : "outline", size: "sm" })}
            >
              {item}
            </Link>
          ))}
        </nav>
      ) : null}

      {visible.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            title={products.length === 0 ? t("shop.emptyTitle") : t("shop.noMatchTitle")}
            description={products.length === 0 ? t("shop.emptyBody") : t("shop.noMatchBody")}
            action={
              products.length > 0 ? (
                <Link href={`${base}/products`} className={buttonVariants({ variant: "outline" })}>
                  {t("shop.clearFilters")}
                </Link>
              ) : null
            }
          />
        </div>
      ) : (
        <ProductTileGrid className="mt-10">
          {visible.map((product, index) => (
            <ProductTile
              key={product.id}
              href={`${base}/products/${product.slug}`}
              name={product.name}
              tagline={product.description.split("\n")[0]}
              price={money(presentmentPrice(store, product.price, product.currency, currency), currency)}
              imageUrl={product.mockups[0]?.url ?? null}
              imageAlt={product.name}
              placeholder={t("shop.previewSoon")}
              priority={index < 3}
              badge={
                soldOut.has(product.id) ? (
                  <Badge tone="slate">{t("shop.soldOut")}</Badge>
                ) : product.shopperCustomization.artworkUpload || product.shopperCustomization.textLine ? (
                  <Badge tone="brand">{t("shop.personalise")}</Badge>
                ) : null
              }
            />
          ))}
        </ProductTileGrid>
      )}
    </div>
  );
}

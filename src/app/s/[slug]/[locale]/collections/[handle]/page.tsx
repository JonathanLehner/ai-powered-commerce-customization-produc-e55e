import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { readCurrency } from "@/app/actions/shop";
import { notFoundRobots, UnknownStoreView } from "@/components/NotFoundViews";
import { ProductTile, ProductTileGrid } from "@/components/ProductTiles";
import { StorefrontNotFoundView } from "@/components/ShopperNotFoundViews";
import { Badge, EmptyState } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getTranslations } from "next-intl/server";
import { shopperIntl, shopperLocale } from "@/i18n/storefront";
import { storeLanguages } from "@/i18n/storefront-routing";
import {
  collectionProducts,
  COLLECTION_SORTS,
  localizeCollection,
  parseSort,
  sortProducts,
  type CollectionSort,
} from "@/lib/collections";
import { publishedProducts, storefrontBySlug } from "@/lib/storefront-data";
import { convert } from "@/lib/pricing";
import { breadcrumbJsonLd, metaDescription, storeUrl } from "@/lib/seo";
import { shopperPageMetadata } from "@/lib/storefront-meta";
import { localizeProduct } from "@/lib/translations";
import { SortSelect } from "./SortSelect";

const collectionPath = (handle: string) => `/collections/${encodeURIComponent(handle)}`;

const SORT_KEYS: Record<CollectionSort, "sortFeatured" | "sortPriceAsc" | "sortPriceDesc" | "sortNewest"> = {
  featured: "sortFeatured",
  "price-asc": "sortPriceAsc",
  "price-desc": "sortPriceDesc",
  newest: "sortNewest",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; locale: string; handle: string }>;
}): Promise<Metadata> {
  const { slug, locale, handle } = await params;
  const data = await storefrontBySlug(slug);
  if (!data) return { title: "Not found", ...notFoundRobots };
  const { store } = data;
  const stored = data.collections.find((c) => c.handle === handle);
  if (!stored) return { title: "Not found", ...notFoundRobots };
  const active = shopperLocale(store, locale);
  const collection = localizeCollection(stored, active, storeLanguages(store).defaultLocale);
  const t = await getTranslations({ locale: active, namespace: "storefront.meta" });
  return shopperPageMetadata(store, active, collectionPath(collection.handle), {
    title: collection.name,
    description:
      metaDescription(collection.description) ||
      t("collectionDescription", { collection: collection.name, store: store.name }),
  });
}

export default async function StorefrontCollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; locale: string; handle: string }>;
  searchParams: Promise<{ tag?: string; sort?: string }>;
}) {
  const [{ slug, locale: requested, handle }, query] = await Promise.all([params, searchParams]);
  const data = await storefrontBySlug(slug);
  // A slug that belongs to no store renders the "not this address" page in
  // Parcelith's own chrome, server-side, rather than raising notFound().
  if (!data) return <UnknownStoreView slug={slug} />;

  const { store } = data;
  // The layout read every collection with the store, so finding this one costs nothing.
  const stored = data.collections.find((c) => c.handle === handle);
  if (!stored) return <StorefrontNotFoundView store={store} locale={requested} />;

  const published = await publishedProducts(store.id);
  const currency = await readCurrency(store.defaultCurrency, store.currencies);
  const { locale, t, money, base } = await shopperIntl(store, requested, `/s/${store.slug}`);
  const { defaultLocale } = storeLanguages(store);
  const collection = localizeCollection(stored, locale, defaultLocale);
  const sort = parseSort(query.sort);
  const tag = query.tag;

  // Only what is on sale, in the collection's own order, priced in the
  // shopper's currency so the price sorts compare like with like.
  const products = collectionProducts(stored.productIds, published)
    .map((p) => localizeProduct(p, locale, defaultLocale))
    .map((p) => ({ ...p, price: convert(p.price, p.currency, currency) }));
  const tags = [...new Set(products.flatMap((p) => p.tags))].sort((a, b) => a.localeCompare(b, locale));
  const visible = sortProducts(
    products.filter((p) => (tag ? p.tags.includes(tag) : true)),
    sort,
  );

  const here = `${base}${collectionPath(collection.handle)}`;
  const hrefWith = (next: { tag?: string; sort?: CollectionSort }) => {
    const params = new URLSearchParams();
    if (next.tag) params.set("tag", next.tag);
    if (next.sort && next.sort !== "featured") params.set("sort", next.sort);
    const search = params.toString();
    return search ? `${here}?${search}` : here;
  };
  const sortOptions = COLLECTION_SORTS.map((value) => ({ value, label: t(`shop.${SORT_KEYS[value]}`) }));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: store.name, url: storeUrl(store, locale) },
          { name: collection.name, url: storeUrl(store, locale, collectionPath(collection.handle)) },
        ])}
      />
      <header
        className={
          collection.imageUrl ? "grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:items-center" : "max-w-2xl"
        }
      >
        <div className="min-w-0">
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
            {collection.name}
          </h1>
          {collection.description ? (
            <p className="mt-3 max-w-2xl text-sm leading-relaxed whitespace-pre-line text-inksoft sm:text-base">
              {collection.description}
            </p>
          ) : null}
          <p className="mt-3 text-sm text-muted-foreground">{t("shop.productCount", { count: products.length })}</p>
        </div>
        {collection.imageUrl ? (
          <div className="overflow-hidden rounded-xl border border-border bg-muted" style={{ aspectRatio: "3 / 2" }}>
            <Image
              src={collection.imageUrl}
              alt=""
              width={1024}
              height={683}
              priority
              sizes="(min-width: 1024px) 480px, 92vw"
              className="h-full w-full object-cover"
            />
          </div>
        ) : null}
      </header>

      <div className="mt-8 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        {tags.length > 0 ? (
          <nav aria-label={t("shop.filterByTag")} className="flex flex-wrap gap-2">
            {tags.slice(0, 12).map((item) => (
              <Link
                key={item}
                href={hrefWith({ tag: item === tag ? undefined : item, sort })}
                aria-current={item === tag ? "true" : undefined}
                className={buttonVariants({ variant: item === tag ? "default" : "outline", size: "sm" })}
              >
                {item}
              </Link>
            ))}
            {tag ? (
              <Link href={hrefWith({ sort })} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                {t("shop.clear")}
              </Link>
            ) : null}
          </nav>
        ) : (
          <span />
        )}
        {products.length > 1 ? (
          <form method="get" action={here} className="flex items-center gap-2">
            <Label htmlFor="collection-sort" className="text-sm font-normal text-muted-foreground">
              {t("shop.sortLabel")}
            </Label>
            <SortSelect
              id="collection-sort"
              value={sort}
              options={sortOptions}
              hrefFor={Object.fromEntries(COLLECTION_SORTS.map((value) => [value, hrefWith({ tag, sort: value })]))}
            />
            {/* The Select cannot open without JavaScript, so the browser gets
                a native select and button instead. */}
            <noscript>
              <style>{"#collection-sort{display:none}"}</style>
              {tag ? <input type="hidden" name="tag" value={tag} /> : null}
              <select
                name="sort"
                defaultValue={sort}
                aria-label={t("shop.sortLabel")}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Button type="submit" variant="outline" size="lg">
                {t("shop.sortApply")}
              </Button>
            </noscript>
          </form>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            title={products.length === 0 ? t("shop.collectionEmptyTitle") : t("shop.noMatchTitle")}
            description={products.length === 0 ? t("shop.emptyBody") : t("shop.noMatchBody")}
            action={
              <Link
                href={products.length === 0 ? `${base}/products` : hrefWith({ sort })}
                className={buttonVariants({ variant: "outline" })}
              >
                {products.length === 0 ? t("chrome.allProducts") : t("shop.clearFilters")}
              </Link>
            }
          />
        </div>
      ) : (
        <ProductTileGrid className="mt-8">
          {visible.map((product, index) => (
            <ProductTile
              key={product.id}
              href={`${base}/products/${product.slug}`}
              name={product.name}
              tagline={product.description.split("\n")[0]}
              price={money(product.price, currency)}
              imageUrl={product.mockups[0]?.url ?? null}
              imageAlt={product.name}
              placeholder={t("shop.previewSoon")}
              // The header image is the largest paint when there is one.
              priority={!collection.imageUrl && index < 3}
              badge={
                product.shopperCustomization.artworkUpload || product.shopperCustomization.textLine ? (
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

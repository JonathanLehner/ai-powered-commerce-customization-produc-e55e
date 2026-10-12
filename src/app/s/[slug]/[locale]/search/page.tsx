import type { Metadata } from "next";
import { SearchIcon } from "lucide-react";
import Link from "next/link";
import { readCurrency } from "@/app/actions/shop";
import { notFoundRobots, UnknownStoreView } from "@/components/NotFoundViews";
import { ProductTile, ProductTileGrid } from "@/components/ProductTiles";
import { EmptyState } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { shopperIntl, shopperLocale, shopperTranslator } from "@/i18n/storefront";
import { convert } from "@/lib/pricing";
import { cleanQuery, SEARCH_LIMITS, searchStore } from "@/lib/search";
import { storeSearchDocuments } from "@/lib/search-data";
import { shopperPageMetadata } from "@/lib/storefront-meta";
import { storefrontBySlug } from "@/lib/storefront-data";

type Params = Promise<{ slug: string; locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, locale } = await params;
  const store = (await storefrontBySlug(slug))?.store ?? null;
  if (!store) return notFoundRobots;
  const active = shopperLocale(store, locale);
  const t = await shopperTranslator(store, active);
  // Result pages are endless variations of one page: kept out of search indexes.
  return shopperPageMetadata(store, active, "/search", { title: t("search.title"), robots: { index: false, follow: true } });
}

/** Search across the store's products, collections, pages and blog posts, typos and all. */
export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const [{ slug, locale: requested }, { q: raw }] = await Promise.all([params, searchParams]);
  const store = (await storefrontBySlug(slug))?.store ?? null;
  if (!store) return <UnknownStoreView slug={slug} />;
  const { locale, t, money, base } = await shopperIntl(store, requested, `/s/${store.slug}`);
  const query = cleanQuery(Array.isArray(raw) ? raw[0] : raw);
  const [documents, currency] = await Promise.all([
    query.length >= 2 ? storeSearchDocuments(store, locale) : Promise.resolve([]),
    readCurrency(store.defaultCurrency, store.currencies),
  ]);
  const results = searchStore(documents, query, SEARCH_LIMITS.page);
  const products = results.filter((r) => r.kind === "product");
  const others = results.filter((r) => r.kind !== "product");

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{t("search.title")}</h1>
      <form method="get" role="search" className="mt-6 flex max-w-xl flex-wrap items-center gap-2">
        <Label htmlFor="search-q" className="sr-only">
          {t("search.label")}
        </Label>
        <div className="min-w-[14rem] flex-1">
          <InputGroup className="h-10">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput id="search-q" name="q" type="search" defaultValue={query} placeholder={t("search.placeholder")} autoFocus={!query} />
          </InputGroup>
        </div>
        <Button type="submit" size="lg">
          {t("search.submit")}
        </Button>
      </form>

      {query.length >= 2 ? (
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          {t("search.count", { count: results.length, query })}
        </p>
      ) : null}

      {query.length >= 2 && results.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title={t("search.noResultsTitle")}
            description={t("search.noResultsBody")}
            action={
              <Link href={`${base}/products`} className="text-sm font-medium text-primary hover:underline">
                {t("search.browse")}
              </Link>
            }
          />
        </div>
      ) : null}

      {products.length > 0 ? (
        <section className="mt-10" aria-labelledby="search-products">
          <h2 id="search-products" className="font-heading text-lg font-semibold text-foreground">
            {t("search.products")}
          </h2>
          <ProductTileGrid className="mt-6" columns={4}>
            {products.map((result, index) => (
              <ProductTile
                key={result.id}
                href={`${base}${result.path}`}
                name={result.title}
                price={result.price !== null && result.currency ? money(convert(result.price, result.currency, currency), currency) : null}
                imageUrl={result.imageUrl}
                imageAlt={result.title}
                placeholder={t("shop.previewSoon")}
                priority={index < 4}
                columns={4}
              />
            ))}
          </ProductTileGrid>
        </section>
      ) : null}

      {others.length > 0 ? (
        <section className="mt-12" aria-labelledby="search-other">
          <h2 id="search-other" className="font-heading text-lg font-semibold text-foreground">
            {t("search.other")}
          </h2>
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {others.map((result) => (
              <li key={`${result.kind}-${result.id}`}>
                <Link href={`${base}${result.path}`} className="block py-4 hover:bg-muted/50">
                  <span className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
                    {t(`search.kinds.${result.kind}`)}
                  </span>
                  <span className="mt-1 block font-medium text-foreground">{result.title}</span>
                  {result.text ? <span className="mt-1 line-clamp-2 block text-sm text-inksoft">{result.text}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

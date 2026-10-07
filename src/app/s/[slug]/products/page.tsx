import type { Metadata } from "next";
import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { readCurrency } from "@/app/actions/shop";
import { notFoundRobots, UnknownStoreView } from "@/components/NotFoundViews";
import { ProductCard } from "@/components/ProductCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getStoreBySlug, listPublishedProducts } from "@/lib/data";
import { fmt, storefrontLocale } from "@/lib/i18n";
import { convert } from "@/lib/pricing";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) return { title: "Shop", ...notFoundRobots };
  const { t } = storefrontLocale(store);
  // The store name is the title suffix the layout adds, so the tab reads
  // "Shop · Northwind Supply Co" rather than naming the store twice.
  return {
    title: t.meta.shopTitle,
    description: fmt(t.meta.shopDescription, { store: store.name }),
  };
}

export default async function StorefrontProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; tag?: string }>;
}) {
  const { slug } = await params;
  const { q, tag } = await searchParams;
  const store = await getStoreBySlug(slug);
  // A slug that belongs to no store renders the "not this address" page in
  // Parcelith's own chrome, server-side, rather than raising notFound().
  if (!store) return <UnknownStoreView slug={slug} />;

  const products = await listPublishedProducts(store.id);
  const currency = await readCurrency(store.defaultCurrency, store.currencies);
  const { t, tag: localeTag, money } = storefrontLocale(store);
  const tags = [...new Set(products.flatMap((p) => p.tags))].sort((a, b) => a.localeCompare(b, localeTag));

  const visible = products
    .filter((p) => (tag ? p.tags.includes(tag) : true))
    .filter((p) =>
      q ? `${p.name} ${p.description} ${p.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase()) : true,
    );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-balance text-ink sm:text-4xl">
          {t.shop.title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {fmt(t.shop.intro, {
            currency,
            tax: store.pricesIncludeTax ? t.shop.taxIncluded : t.shop.taxAtCheckout,
          })}
        </p>
      </header>

      <div className="mt-10 flex flex-col gap-4 border-y border-line py-4 lg:flex-row lg:items-center lg:justify-between">
        <form method="get" className="flex w-full items-end gap-2 lg:max-w-sm">
          <div className="min-w-0 flex-1">
            <Label htmlFor="q" className="sr-only">
              {t.shop.searchLabel}
            </Label>
            <div className="relative">
              <SearchIcon
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
              />
              <Input
                id="q"
                name="q"
                defaultValue={q ?? ""}
                placeholder={t.shop.searchPlaceholder}
                className="h-9 pl-9"
              />
            </div>
          </div>
          {tag ? <input type="hidden" name="tag" value={tag} /> : null}
          <Button type="submit" variant="outline" size="sm" className="h-9">
            {t.shop.searchSubmit}
          </Button>
          {q || tag ? (
            <Button asChild variant="ghost" size="sm" className="h-9">
              <Link href={`/s/${store.slug}/products`}>{t.shop.clear}</Link>
            </Button>
          ) : null}
        </form>

        {tags.length > 0 ? (
          <nav
            aria-label={t.shop.filterByTag}
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0"
          >
            {tags.slice(0, 12).map((item) => (
              <Link
                key={item}
                href={`/s/${store.slug}/products?tag=${encodeURIComponent(item)}`}
                aria-current={item === tag ? "true" : undefined}
                className={
                  item === tag
                    ? "shrink-0 rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-white"
                    : "shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-inksoft transition-colors hover:border-ink/25 hover:text-ink"
                }
              >
                {item}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            title={products.length === 0 ? t.shop.emptyTitle : t.shop.noMatchTitle}
            description={products.length === 0 ? t.shop.emptyBody : t.shop.noMatchBody}
            action={
              products.length > 0 ? (
                <Button asChild variant="outline">
                  <Link href={`/s/${store.slug}/products`}>{t.shop.clearFilters}</Link>
                </Button>
              ) : null
            }
          />
        </div>
      ) : (
        <ul className="mt-10 grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-3">
          {visible.map((product, index) => (
            <li key={product.id}>
              <ProductCard
                href={`/s/${store.slug}/products/${product.slug}`}
                name={product.name}
                price={money(convert(product.price, product.currency, currency), currency)}
                tagline={product.description.split("\n")[0]}
                imageUrl={product.mockups[0]?.url ?? null}
                placeholder={t.shop.previewSoon}
                eager={index < 2}
                badge={
                  product.shopperCustomization.artworkUpload ||
                  product.shopperCustomization.textLine ? (
                    <Badge variant="solid">{t.shop.personalise}</Badge>
                  ) : null
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

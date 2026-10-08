import type { Metadata } from "next";
import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { readCurrency } from "@/app/actions/shop";
import { notFoundRobots, UnknownStoreView } from "@/components/NotFoundViews";
import { ProductTile, ProductTileGrid } from "@/components/ProductTiles";
import { Badge, EmptyState } from "@/components/ui";
import { getStoreBySlug, listPublishedProducts } from "@/lib/data";
import { fmt, storefrontLocale } from "@/lib/i18n";
import { convert } from "@/lib/pricing";
import { Button, buttonVariants } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";

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
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <header className="max-w-2xl">
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {t.shop.title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-inksoft">
          {fmt(t.shop.intro, {
            currency,
            tax: store.pricesIncludeTax ? t.shop.taxIncluded : t.shop.taxAtCheckout,
          })}
        </p>
      </header>

      <form method="get" className="mt-8 flex flex-wrap items-center gap-2">
        <Label htmlFor="q" className="sr-only">
          {t.shop.searchLabel}
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
              placeholder={t.shop.searchPlaceholder}
            />
          </InputGroup>
        </div>
        {tag ? <input type="hidden" name="tag" value={tag} /> : null}
        <Button type="submit" variant="outline" size="lg">
          {t.shop.searchSubmit}
        </Button>
        {q || tag ? (
          <Link
            href={`/s/${store.slug}/products`}
            className={buttonVariants({ variant: "ghost", size: "lg" })}
          >
            {t.shop.clear}
          </Link>
        ) : null}
      </form>

      {tags.length > 0 ? (
        <nav aria-label={t.shop.filterByTag} className="mt-3 flex flex-wrap gap-2">
          {tags.slice(0, 12).map((item) => (
            <Link
              key={item}
              href={`/s/${store.slug}/products?tag=${encodeURIComponent(item)}`}
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
            title={products.length === 0 ? t.shop.emptyTitle : t.shop.noMatchTitle}
            description={products.length === 0 ? t.shop.emptyBody : t.shop.noMatchBody}
            action={
              products.length > 0 ? (
                <Link href={`/s/${store.slug}/products`} className={buttonVariants({ variant: "outline" })}>
                  {t.shop.clearFilters}
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
              href={`/s/${store.slug}/products/${product.slug}`}
              name={product.name}
              tagline={product.description.split("\n")[0]}
              price={money(convert(product.price, product.currency, currency), currency)}
              imageUrl={product.mockups[0]?.url ?? null}
              imageAlt={product.name}
              placeholder={t.shop.previewSoon}
              priority={index < 3}
              badge={
                product.shopperCustomization.artworkUpload || product.shopperCustomization.textLine ? (
                  <Badge tone="brand">{t.shop.personalise}</Badge>
                ) : null
              }
            />
          ))}
        </ProductTileGrid>
      )}
    </div>
  );
}

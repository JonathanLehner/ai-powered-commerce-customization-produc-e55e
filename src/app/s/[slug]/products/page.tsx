import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { readCurrency } from "@/app/actions/shop";
import { notFoundRobots, UnknownStoreView } from "@/components/NotFoundViews";
import { Badge, EmptyState } from "@/components/ui";
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
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{t.shop.title}</h1>
      <p className="mt-2 max-w-2xl text-sm text-inksoft">
        {fmt(t.shop.intro, {
          currency,
          tax: store.pricesIncludeTax ? t.shop.taxIncluded : t.shop.taxAtCheckout,
        })}
      </p>

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1">
          <label htmlFor="q" className="field-label text-xs">
            {t.shop.searchLabel}
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q ?? ""}
            placeholder={t.shop.searchPlaceholder}
            className="input py-1.5"
          />
        </div>
        {tag ? <input type="hidden" name="tag" value={tag} /> : null}
        <button type="submit" className="btn-secondary">
          {t.shop.searchSubmit}
        </button>
        {q || tag ? (
          <Link href={`/s/${store.slug}/products`} className="btn-ghost">
            {t.shop.clear}
          </Link>
        ) : null}
      </form>

      {tags.length > 0 ? (
        <nav aria-label={t.shop.filterByTag} className="mt-4 flex flex-wrap gap-2">
          {tags.slice(0, 12).map((item) => (
            <Link
              key={item}
              href={`/s/${store.slug}/products?tag=${encodeURIComponent(item)}`}
              className={item === tag ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
            >
              {item}
            </Link>
          ))}
        </nav>
      ) : null}

      {visible.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title={products.length === 0 ? t.shop.emptyTitle : t.shop.noMatchTitle}
            description={products.length === 0 ? t.shop.emptyBody : t.shop.noMatchBody}
            action={
              products.length > 0 ? (
                <Link href={`/s/${store.slug}/products`} className="btn-secondary">
                  {t.shop.clearFilters}
                </Link>
              ) : null
            }
          />
        </div>
      ) : (
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((product, index) => (
            <li key={product.id} className="group overflow-hidden rounded-xl border border-line bg-white">
              <Link href={`/s/${store.slug}/products/${product.slug}`}>
                <div className="bg-canvas">
                  {product.mockups[0] ? (
                    <Image
                      src={product.mockups[0].url}
                      alt={product.name}
                      width={640}
                      height={640}
                      priority={index < 3}
                      loading={index < 3 ? "eager" : "lazy"}
                      sizes="(min-width: 1024px) 360px, (min-width: 640px) 45vw, 90vw"
                      className="h-auto w-full object-cover transition group-hover:scale-[1.02]"
                      style={{ aspectRatio: "1 / 1" }}
                    />
                  ) : (
                    <div className="flex items-center justify-center text-sm text-muted" style={{ aspectRatio: "1 / 1" }}>
                      {t.shop.previewSoon}
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-sm font-semibold text-ink">{product.name}</h2>
                    {product.shopperCustomization.artworkUpload || product.shopperCustomization.textLine ? (
                      <Badge tone="brand">{t.shop.personalise}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted">{product.description.split("\n")[0]}</p>
                  <p className="mt-2 text-sm font-semibold tabular-nums text-ink">
                    {money(convert(product.price, product.currency, currency), currency)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

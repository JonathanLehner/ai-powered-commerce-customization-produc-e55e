import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readCurrency } from "@/app/actions/shop";
import { Badge, EmptyState } from "@/components/ui";
import { getStoreBySlug, listPublishedProducts } from "@/lib/data";
import { convert } from "@/lib/pricing";
import { formatMoney } from "@/lib/util";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  return {
    title: store ? `Shop — ${store.name}` : "Shop",
    description: store ? `Every product available from ${store.name}.` : undefined,
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
  if (!store) notFound();

  const products = await listPublishedProducts(store.id);
  const currency = await readCurrency(store.defaultCurrency, store.currencies);
  const tags = [...new Set(products.flatMap((p) => p.tags))].sort();

  const visible = products
    .filter((p) => (tag ? p.tags.includes(tag) : true))
    .filter((p) =>
      q ? `${p.name} ${p.description} ${p.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase()) : true,
    );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Everything in the shop</h1>
      <p className="mt-2 max-w-2xl text-sm text-inksoft">
        Made to order and shipped worldwide. Prices in {currency}
        {store.pricesIncludeTax ? ", tax included" : "; tax is added at checkout"}.
      </p>

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1">
          <label htmlFor="q" className="field-label text-xs">
            Search
          </label>
          <input id="q" name="q" defaultValue={q ?? ""} placeholder="Tee, hoodie, mug…" className="input py-1.5" />
        </div>
        {tag ? <input type="hidden" name="tag" value={tag} /> : null}
        <button type="submit" className="btn-secondary">
          Search
        </button>
        {q || tag ? (
          <Link href={`/s/${store.slug}/products`} className="btn-ghost">
            Clear
          </Link>
        ) : null}
      </form>

      {tags.length > 0 ? (
        <nav aria-label="Filter by tag" className="mt-4 flex flex-wrap gap-2">
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
            title={products.length === 0 ? "Nothing published yet" : "No products match that search"}
            description={
              products.length === 0
                ? "This store has not published any products yet. Check back soon."
                : "Try a different search term or clear the filters."
            }
            action={
              products.length > 0 ? (
                <Link href={`/s/${store.slug}/products`} className="btn-secondary">
                  Clear filters
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
                      Preview coming soon
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-sm font-semibold text-ink">{product.name}</h2>
                    {product.shopperCustomization.artworkUpload || product.shopperCustomization.textLine ? (
                      <Badge tone="brand">Personalise</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted">{product.description.split("\n")[0]}</p>
                  <p className="mt-2 text-sm font-semibold tabular-nums text-ink">
                    {formatMoney(convert(product.price, product.currency, currency), currency)}
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

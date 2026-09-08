import type { Metadata } from "next";
import Link from "next/link";
import { readCurrency } from "@/app/actions/shop";
import { notFoundRobots, UnknownStoreView } from "@/components/NotFoundViews";
import { RenderSection, type StorefrontContext } from "@/components/sections";
import { getStoreBySlug, getStorefront, listPublishedProducts } from "@/lib/data";
import { fmt, storefrontLocale } from "@/lib/i18n";
import { convert } from "@/lib/pricing";
import { sectionsFromTree } from "@/lib/storefront-schema";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) return { title: "Store not found", ...notFoundRobots };
  // The storefront layout titles and describes the store itself; the home page
  // is that store, so it adds nothing of its own rather than saying the name
  // twice in one tab.
  return {};
}

export default async function StorefrontHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  // A slug that belongs to no store renders the "not this address" page in
  // Parcelith's own chrome, server-side, rather than raising notFound().
  if (!store) return <UnknownStoreView slug={slug} />;

  const [storefront, products] = await Promise.all([
    getStorefront(store.id),
    listPublishedProducts(store.id),
  ]);
  const currency = await readCurrency(store.defaultCurrency, store.currencies);
  const sections = sectionsFromTree(storefront?.published);
  const { t, tag } = storefrontLocale(store);

  const ctx: StorefrontContext = {
    storeName: store.name,
    clientName: store.clientName,
    slug: store.slug,
    logoUrl: store.logoUrl,
    theme: store.theme,
    preview: false,
    t: t.sections,
    localeTag: tag,
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      price: convert(p.price, p.currency, currency),
      currency,
      imageUrl: p.mockups[0]?.url ?? null,
      tagline: p.description.split("\n")[0].slice(0, 110),
    })),
  };

  if (store.status === "archived") {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-24 text-center sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t.home.closedTitle}</h1>
        <p className="mt-3 text-sm text-muted">
          {fmt(t.home.closedBody, { client: store.clientName, store: store.name })}
        </p>
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-24 text-center sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          {fmt(t.home.comingSoonTitle, { store: store.name })}
        </h1>
        <p className="mt-3 text-sm text-muted">
          {t.home.comingSoonBody}{" "}
          {products.length > 0 ? t.home.comingSoonWithProducts : t.home.comingSoonNoProducts}
        </p>
        {products.length > 0 ? (
          <Link href={`/s/${store.slug}/products`} className="btn-primary mt-6">
            {fmt(t.home.browseProducts, { count: products.length })}
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <>
      {sections.map((section) => (
        <RenderSection key={section.id} type={section.type} props={section.props} ctx={ctx} />
      ))}
    </>
  );
}

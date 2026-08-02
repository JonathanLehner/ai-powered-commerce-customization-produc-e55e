import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readCurrency } from "@/app/actions/shop";
import { RenderSection, type StorefrontContext } from "@/components/sections";
import { getStoreBySlug, getStorefront, listPublishedProducts } from "@/lib/data";
import { convert } from "@/lib/pricing";
import { sectionsFromTree } from "@/lib/storefront-schema";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) return { title: "Store not found" };
  return {
    title: `${store.name} — made-to-order merchandise`,
    description: `Shop ${store.name}, the official store for ${store.clientName}. Printed on demand and shipped worldwide.`,
  };
}

export default async function StorefrontHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  const [storefront, products] = await Promise.all([
    getStorefront(store.id),
    listPublishedProducts(store.id),
  ]);
  const currency = await readCurrency(store.defaultCurrency, store.currencies);
  const sections = sectionsFromTree(storefront?.published);

  const ctx: StorefrontContext = {
    storeName: store.name,
    clientName: store.clientName,
    slug: store.slug,
    logoUrl: store.logoUrl,
    theme: store.theme,
    preview: false,
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
        <h1 className="text-2xl font-semibold tracking-tight text-ink">This store is closed</h1>
        <p className="mt-3 text-sm text-muted">
          {store.clientName} has archived {store.name}. Existing orders are still being fulfilled and their
          status pages remain available.
        </p>
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-24 text-center sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{store.name} is nearly ready</h1>
        <p className="mt-3 text-sm text-muted">
          The storefront layout has not been published yet. {products.length > 0 ? "Products are live and can be browsed in the meantime." : "Check back shortly."}
        </p>
        {products.length > 0 ? (
          <Link href={`/s/${store.slug}/products`} className="btn-primary mt-6">
            Browse {products.length} products
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

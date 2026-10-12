import { listPublishedContent } from "@/lib/content-data";
import { getStoreBySlug, listProductCollections, listPublishedProducts } from "@/lib/data";
import { sitemapXml, storeSitemap } from "@/lib/seo";

/**
 * A storefront's sitemap: every page in every enabled language, with hreflang
 * alternates. On a store's custom domain `src/proxy.ts` serves it at
 * `/sitemap.xml`.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) return new Response("Not found", { status: 404 });
  const [products, collections, content] =
    store.status === "archived"
      ? [[], [], []]
      : await Promise.all([listPublishedProducts(store.id), listProductCollections(store.id), listPublishedContent(store.id)]);
  return new Response(sitemapXml(storeSitemap(store, products, collections, content)), {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600",
    },
  });
}

import { getStoreBySlug } from "@/lib/data";
import { storeRobotsTxt } from "@/lib/seo";

/**
 * A storefront's robots file, pointing at its sitemap. On a store's custom
 * domain `src/proxy.ts` serves it at `/robots.txt`.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) return new Response("Not found", { status: 404 });
  return new Response(storeRobotsTxt(store), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600",
    },
  });
}

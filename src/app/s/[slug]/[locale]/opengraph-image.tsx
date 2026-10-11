import { getTranslations } from "next-intl/server";
import { shopperLocale } from "@/i18n/storefront";
import { storeLanguages } from "@/i18n/storefront-routing";
import { getStoreBySlug, getStorefront } from "@/lib/data";
import { drawableImage, SHARE_SIZE, storeShareImage } from "@/lib/share-image";
import { storeSeo, storeTagline } from "@/lib/storefront-meta";
import { siteContent } from "@/lib/translations";

/**
 * The share image of every storefront page that has none of its own: the
 * store's logo, name and description in its colours. Read per request, so a
 * new logo or description shows in the next preview.
 */
export const dynamic = "force-dynamic";
export const size = SHARE_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string; locale: string }> }) {
  const { slug, locale } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) return new Response("Not found", { status: 404 });
  const active = shopperLocale(store, locale);
  const [storefront, t, logo] = await Promise.all([
    getStorefront(store.id),
    getTranslations({ locale: active, namespace: "storefront.meta" }),
    drawableImage(store.logoUrl),
  ]);
  const site = siteContent(storefront?.published, active, storeLanguages(store).defaultLocale);
  const seo = storeSeo(store, t, storeTagline(storefront?.published), site);
  return storeShareImage({ theme: store.theme, name: store.name, description: seo.description, logo });
}

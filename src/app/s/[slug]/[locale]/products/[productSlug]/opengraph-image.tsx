import { getFormatter } from "next-intl/server";
import { formatMinorUnits } from "@/i18n/format";
import { shopperLocale } from "@/i18n/storefront";
import { storeLanguages } from "@/i18n/storefront-routing";
import { isLive } from "@/lib/artwork";
import { getStoreBySlug, getStoreProductBySlug } from "@/lib/data";
import { convert } from "@/lib/pricing";
import { drawableImage, productShareImage, SHARE_SIZE } from "@/lib/share-image";
import { localizeProduct } from "@/lib/translations";

/**
 * A product's share image: its first mockup, name and price in the store's
 * colours. The price is the one the shop lists it at, in the store's default
 * currency. Read per request, so a price change shows in the next preview.
 */
export const dynamic = "force-dynamic";
export const size = SHARE_SIZE;
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string; locale: string; productSlug: string }>;
}) {
  const { slug, locale, productSlug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) return new Response("Not found", { status: 404 });
  const stored = await getStoreProductBySlug(store.id, productSlug);
  if (!stored || !isLive(stored)) return new Response("Not found", { status: 404 });

  const active = shopperLocale(store, locale);
  const product = localizeProduct(stored, active, storeLanguages(store).defaultLocale);
  const mockup = product.mockups.find((m) => m.shareUrl) ?? null;
  const [format, image, logo] = await Promise.all([
    getFormatter({ locale: active }),
    drawableImage(mockup?.shareUrl ?? product.mockups[0]?.url),
    drawableImage(store.logoUrl),
  ]);
  const currency = store.defaultCurrency;
  return productShareImage({
    theme: store.theme,
    storeName: store.name,
    logo,
    name: product.name,
    price: formatMinorUnits(format, convert(product.price, product.currency, currency), currency),
    image,
  });
}

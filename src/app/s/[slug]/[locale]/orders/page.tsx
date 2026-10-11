import type { Metadata } from "next";
import { UnknownStoreView } from "@/components/NotFoundViews";
import { getTranslations } from "next-intl/server";
import { shopperIntl, shopperLocale } from "@/i18n/storefront";
import { getStoreBySlug } from "@/lib/data";
import { OrderLookupForm } from "./OrderLookupForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}): Promise<Metadata> {
  const { slug, locale } = await params;
  const store = await getStoreBySlug(slug);
  const t = store
    ? await getTranslations({ locale: shopperLocale(store, locale), namespace: "storefront.order" })
    : null;
  return {
    title: t ? t("title") : "Order status",
    robots: { index: false, follow: false },
  };
}

export default async function OrderLookupPage({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug, locale } = await params;
  const store = await getStoreBySlug(slug);
  // A slug that belongs to no store renders the "not this address" page in
  // Parcelith's own chrome, server-side, rather than raising notFound().
  if (!store) return <UnknownStoreView slug={slug} />;
  const { t } = await shopperIntl(store, locale, `/s/${store.slug}`);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">{t("order.title")}</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("order.lookupIntro")}</p>
      <OrderLookupForm slug={store.slug} />
    </div>
  );
}

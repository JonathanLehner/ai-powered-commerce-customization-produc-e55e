import type { Metadata } from "next";
import { notFoundRobots, UnknownStoreView } from "@/components/NotFoundViews";
import { PolicyPage } from "@/components/PolicyPage";
import { StorefrontNotFoundView } from "@/components/ShopperNotFoundViews";
import { shopperLocale, shopperTranslator } from "@/i18n/storefront";
import { getStoreBySlug } from "@/lib/data";
import { isPolicyKey } from "@/lib/policies";
import { shopperPageMetadata } from "@/lib/storefront-meta";

type Params = Promise<{ slug: string; locale: string; policy: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, locale, policy } = await params;
  const store = await getStoreBySlug(slug);
  if (!store || !isPolicyKey(policy)) return notFoundRobots;
  const active = shopperLocale(store, locale);
  const t = await shopperTranslator(store, active);
  return shopperPageMetadata(store, active, `/policies/${policy}`, { title: t(`policies.${policy}`) });
}

/** One of the store's own refund, shipping, terms of sale or privacy pages. */
export default async function StorePolicyPage({ params }: { params: Params }) {
  const { slug, locale, policy } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) return <UnknownStoreView slug={slug} />;
  if (!isPolicyKey(policy)) return <StorefrontNotFoundView store={store} locale={locale} />;
  return <PolicyPage store={store} policy={policy} locale={locale} root={`/s/${store.slug}`} />;
}

import type { Metadata } from "next";
import { notFoundRobots, UnknownGiftPortalView } from "@/components/NotFoundViews";
import { PolicyPage } from "@/components/PolicyPage";
import { GiftPortalNotFoundView } from "@/components/ShopperNotFoundViews";
import { shopperLocale, shopperTranslator } from "@/i18n/storefront";
import { getGiftCatalogueBySlug, getStore } from "@/lib/data";
import { isPolicyKey } from "@/lib/policies";

type Params = Promise<{ slug: string; locale: string; policy: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, locale, policy } = await params;
  const catalogue = await getGiftCatalogueBySlug(slug);
  const store = catalogue ? await getStore(catalogue.storeId) : null;
  if (!catalogue || !store || !isPolicyKey(policy)) return notFoundRobots;
  const t = await shopperTranslator(store, shopperLocale(store, locale));
  return { title: t(`policies.${policy}`), ...notFoundRobots };
}

/** The store's policies inside a gift portal, so a recipient stays in the portal to read them. */
export default async function GiftPortalPolicyPage({ params }: { params: Params }) {
  const { slug, locale, policy } = await params;
  const catalogue = await getGiftCatalogueBySlug(slug);
  const store = catalogue ? await getStore(catalogue.storeId) : null;
  if (!catalogue) return <UnknownGiftPortalView slug={slug} />;
  if (!store || !isPolicyKey(policy)) {
    return <GiftPortalNotFoundView catalogue={catalogue} store={store} locale={locale} />;
  }
  return <PolicyPage store={store} policy={policy} locale={locale} root={`/g/${catalogue.slug}`} />;
}

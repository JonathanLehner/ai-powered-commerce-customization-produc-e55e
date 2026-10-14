import type { Metadata } from "next";
import { readCurrency } from "@/app/actions/shop";
import { UnknownStoreView } from "@/components/NotFoundViews";
import { RenderSection } from "@/components/sections";
import { shopperIntl, shopperMessages } from "@/i18n/storefront";
import { storeLanguages } from "@/i18n/storefront-routing";
import { presentmentPrice } from "@/lib/currency";
import { getStorefront } from "@/lib/data";
import { publishedProducts, storefrontBySlug } from "@/lib/storefront-data";
import { previewLinkValid } from "@/lib/storefront-preview";
import { storefrontContext } from "@/lib/storefront-context";
import { generatedHomeSections } from "@/lib/storefront-defaults";
import { SECTION_DEFS, sectionsFromTree } from "@/lib/storefront-schema";
import { localizeSectionProps } from "@/lib/translations";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The unpublished storefront draft, behind a signed link from the Admin API's
 * previewStorefront, so changes can be looked at before publishing them.
 */
export default async function StorefrontPreview({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; locale: string }>;
  searchParams: Promise<{ expires?: string; t?: string }>;
}) {
  const [{ slug, locale: requested }, { expires, t: token }] = await Promise.all([params, searchParams]);
  const data = await storefrontBySlug(slug);
  if (!data) return <UnknownStoreView slug={slug} />;
  const { store, collections } = data;
  const { locale, t, money, base } = await shopperIntl(store, requested, `/s/${store.slug}`);

  if (!(await previewLinkValid(store.id, expires, token))) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-24 text-center sm:px-6">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">{t("home.previewExpired")}</h1>
      </div>
    );
  }

  const [storefront, products, currency, messages] = await Promise.all([
    getStorefront(store.id),
    publishedProducts(store.id),
    readCurrency(store.defaultCurrency, store.currencies),
    shopperMessages(store, locale),
  ]);
  const { defaultLocale } = storeLanguages(store);
  const ctx = storefrontContext({
    store,
    products,
    collections,
    locale,
    defaultLocale,
    base,
    preview: false,
    t: messages.storefront.sections,
    price: (p) => money(presentmentPrice(store, p.price, p.currency, currency), currency),
  });
  const drafted = sectionsFromTree(storefront?.draft);
  const sections =
    drafted.length > 0
      ? drafted.map((section) => ({ ...section, props: localizeSectionProps(section.type, section.props, locale, defaultLocale) }))
      : generatedHomeSections({ storeName: store.name, products: ctx.products, collections, copy: messages.storefront.sections.generated }).map(
          (section, i) => ({ id: `generated-${i}`, ...section, props: { ...SECTION_DEFS[section.type].defaults, ...section.props } }),
        );

  return (
    <>
      <p className="bg-muted px-4 py-2 text-center text-xs font-medium text-muted-foreground">{t("home.previewBanner")}</p>
      {sections.map((section, index) => (
        <RenderSection key={section.id} type={section.type} props={section.props} ctx={ctx} index={index} />
      ))}
    </>
  );
}

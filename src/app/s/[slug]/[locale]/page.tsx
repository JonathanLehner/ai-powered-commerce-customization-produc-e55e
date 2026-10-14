import type { Metadata } from "next";
import { readCurrency } from "@/app/actions/shop";
import { notFoundRobots, UnknownStoreView } from "@/components/NotFoundViews";
import { RenderSection } from "@/components/sections";
import { getTranslations } from "next-intl/server";
import { JsonLd } from "@/components/JsonLd";
import { shopperIntl, shopperLocale, shopperMessages } from "@/i18n/storefront";
import { storeLanguages } from "@/i18n/storefront-routing";
import { publishedProducts, storefrontBySlug } from "@/lib/storefront-data";
import { presentmentPrice } from "@/lib/currency";
import { storefrontContext } from "@/lib/storefront-context";
import { generatedHomeSections } from "@/lib/storefront-defaults";
import { SECTION_DEFS, sectionsFromTree } from "@/lib/storefront-schema";
import { organizationJsonLd, storeUrl } from "@/lib/seo";
import { shopperPageMetadata, storeSeo, storeTagline } from "@/lib/storefront-meta";
import { storeSupport } from "@/lib/support";
import { localizeSectionProps, siteContent } from "@/lib/translations";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}): Promise<Metadata> {
  const { slug, locale } = await params;
  const data = await storefrontBySlug(slug);
  if (!data) return { title: "Store not found", ...notFoundRobots };
  const { store, storefront } = data;
  // The home page is the store itself, so it carries the store's own title and
  // description rather than adding a page name to it.
  const active = shopperLocale(store, locale);
  const t = await getTranslations({ locale: active, namespace: "storefront.meta" });
  const site = siteContent(storefront?.published, active, storeLanguages(store).defaultLocale);
  const seo = storeSeo(store, t, storeTagline(storefront?.published), site);
  return shopperPageMetadata(store, active, "", { title: seo.title, description: seo.description, absolute: true });
}

export default async function StorefrontHome({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug, locale: requested } = await params;
  const data = await storefrontBySlug(slug);
  // A slug that belongs to no store renders the "not this address" page in
  // Parcelith's own chrome, server-side, rather than raising notFound().
  if (!data) return <UnknownStoreView slug={slug} />;

  const { store, storefront, collections } = data;
  const products = await publishedProducts(store.id);
  const currency = await readCurrency(store.defaultCurrency, store.currencies);
  const { locale, t, money, base } = await shopperIntl(store, requested, `/s/${store.slug}`);
  const { defaultLocale } = storeLanguages(store);
  const messages = await shopperMessages(store, locale);

  if (store.status === "archived") {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-24 text-center sm:px-6">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">{t("home.closedTitle")}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {t("home.closedBody")}
        </p>
      </div>
    );
  }

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
  // Section copy in the shopper's language, falling back to the store's
  // default language wherever a translation is missing. A store that has not
  // published a page yet gets one built from its products and name.
  const published = sectionsFromTree(storefront?.published);
  const sections =
    published.length > 0
      ? published.map((section) => ({
          ...section,
          props: localizeSectionProps(section.type, section.props, locale, defaultLocale),
        }))
      : generatedHomeSections({
          storeName: store.name,
          products: ctx.products,
          collections,
          copy: messages.storefront.sections.generated,
        }).map((section, i) => ({ id: `generated-${i}`, ...section, props: { ...SECTION_DEFS[section.type].defaults, ...section.props } }));

  const support = storeSupport(store);
  return (
    <>
      <JsonLd
        data={organizationJsonLd({
          name: store.name,
          url: storeUrl(store, locale),
          logo: store.logoUrl,
          email: support.email,
          phone: support.phone,
        })}
      />
      {sections.map((section, index) => (
        <RenderSection key={section.id} type={section.type} props={section.props} ctx={ctx} index={index} />
      ))}
    </>
  );
}

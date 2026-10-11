import type { Metadata } from "next";
import Link from "next/link";
import { readCurrency } from "@/app/actions/shop";
import { notFoundRobots, UnknownStoreView } from "@/components/NotFoundViews";
import { RenderSection, type StorefrontContext } from "@/components/sections";
import { shopperIntl, shopperLocale, shopperMessages, storefrontAlternates } from "@/i18n/storefront";
import { storeLanguages } from "@/i18n/storefront-routing";
import { getStoreBySlug, getStorefront, listPublishedProducts } from "@/lib/data";
import { convert } from "@/lib/pricing";
import { sectionsFromTree } from "@/lib/storefront-schema";
import { localizeProduct, localizeSectionProps } from "@/lib/translations";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}): Promise<Metadata> {
  const { slug, locale } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) return { title: "Store not found", ...notFoundRobots };
  // The storefront layout titles and describes the store itself; the home page
  // is that store, so it adds only its addresses rather than saying the name
  // twice in one tab.
  return { alternates: storefrontAlternates(store, shopperLocale(store, locale)) };
}

export default async function StorefrontHome({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug, locale: requested } = await params;
  const store = await getStoreBySlug(slug);
  // A slug that belongs to no store renders the "not this address" page in
  // Parcelith's own chrome, server-side, rather than raising notFound().
  if (!store) return <UnknownStoreView slug={slug} />;

  const [storefront, products] = await Promise.all([
    getStorefront(store.id),
    listPublishedProducts(store.id),
  ]);
  const currency = await readCurrency(store.defaultCurrency, store.currencies);
  const { locale, t, money, base } = await shopperIntl(store, requested, `/s/${store.slug}`);
  const { defaultLocale } = storeLanguages(store);
  // Section copy and product names in the shopper's language, falling back to
  // the store's default language wherever a translation is missing.
  const sections = sectionsFromTree(storefront?.published).map((section) => ({
    ...section,
    props: localizeSectionProps(section.type, section.props, locale, defaultLocale),
  }));
  const messages = await shopperMessages(store, locale);

  const ctx: StorefrontContext = {
    storeName: store.name,
    clientName: store.clientName,
    base,
    logoUrl: store.logoUrl,
    theme: store.theme,
    preview: false,
    t: messages.storefront.sections,
    products: products.map((product) => localizeProduct(product, locale, defaultLocale)).map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      price: money(convert(p.price, p.currency, currency), currency),
      imageUrl: p.mockups[0]?.url ?? null,
      tagline: p.description.split("\n")[0].slice(0, 110),
    })),
  };

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

  if (sections.length === 0) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-24 text-center sm:px-6">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          {t("home.comingSoonTitle", { store: store.name })}
        </h1>
        {products.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("home.comingSoonNoProducts")}</p>
        ) : null}
        {products.length> 0 ? (
          <Link href={`${base}/products`} className={cn(buttonVariants({ size: "lg" }), "mt-6")}>
            {t("home.browseProducts", { count: products.length })}
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

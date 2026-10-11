import { getFormatter, getMessages, getTranslations } from "next-intl/server";
import { revertStorefront } from "@/app/actions/storefront";
import { Callout, PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import type { StorefrontContext } from "@/components/sections";
import { collectionFields, localizeCollection } from "@/lib/collections";
import { getStorefront, listGiftCatalogues, listProductCollections, listStoreProducts } from "@/lib/data";
import { formatMinorUnits } from "@/i18n/format";
import { isLocale } from "@/i18n/locales";
import { shopperMessages } from "@/i18n/storefront";
import { storeLanguages } from "@/i18n/storefront-routing";
import { requireStoreAccess } from "@/lib/session";
import { flattenShopText, shopTextEntries } from "@/lib/shop-text";
import { treeFromSections } from "@/lib/storefront-schema";
import { localizeProduct, productFields } from "@/lib/translations";
import type { ShopTextData } from "./ShopTextSheet";
import { StorefrontEditor } from "./StorefrontEditor";

export default async function StorefrontEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const [{ storeId }, { lang }] = await Promise.all([params, searchParams]);
  const { store } = await requireStoreAccess(storeId, "store.storefront");
  const [storefront, products, catalogues, collections] = await Promise.all([
    getStorefront(storeId),
    listStoreProducts(storeId),
    listGiftCatalogues(storeId),
    listProductCollections(storeId),
  ]);

  const published = products.filter((p) => p.status === "published");
  // The preview reads the same messages, Shop text and formatting the live
  // storefront does, once per enabled language, so switching language in the
  // editor redraws the page without a round trip.
  const { locales, defaultLocale } = storeLanguages(store);
  const initialLocale = isLocale(lang) && locales.includes(lang) ? lang : defaultLocale;
  const perLocale = await Promise.all(
    locales.map(async (locale) => {
      const [builtIn, merged, format] = await Promise.all([
        getMessages({ locale }),
        shopperMessages(store, locale),
        getFormatter({ locale }),
      ]);
      const context: StorefrontContext = {
        storeName: store.name,
        clientName: store.clientName,
        base: `/s/${store.slug}`,
        logoUrl: store.logoUrl,
        theme: store.theme,
        preview: true,
        t: merged.storefront.sections,
        products: published
          .map((product) => localizeProduct(product, locale, defaultLocale))
          .map((p) => ({
            id: p.id,
            name: p.name,
            slug: p.slug,
            price: formatMinorUnits(format, p.price, p.currency),
            imageUrl: p.mockups[0]?.url ?? null,
            tagline: p.description.split("\n")[0].slice(0, 110),
          })),
        collections: collections.map((c) => ({
          id: c.id,
          handle: c.handle,
          productIds: c.productIds,
          name: localizeCollection(c, locale, defaultLocale).name,
        })),
      };
      const storefrontMessages = builtIn.storefront as unknown as Record<string, unknown>;
      return {
        locale,
        context,
        chrome: {
          shop: merged.storefront.chrome.shop,
          orderStatus: merged.storefront.chrome.orderStatus,
          shipsWithin: merged.storefront.chrome.shipsWithin,
        },
        entries: shopTextEntries(storefrontMessages),
      };
    }),
  );
  const shopText: ShopTextData = {
    entries: (perLocale.find((entry) => entry.locale === defaultLocale) ?? perLocale[0]).entries.map(
      ({ page, key }) => ({ page, key }),
    ),
    builtIn: Object.fromEntries(
      perLocale.map(({ locale, entries }) => [locale, Object.fromEntries(entries.map((e) => [e.key, e.text]))]),
    ),
    overrides: Object.fromEntries(locales.map((locale) => [locale, flattenShopText(store.shopText?.[locale])])),
  };

  const tree =
    storefront?.draft && Object.keys(storefront.draft).length > 0
      ? (storefront.draft as Record<string, unknown>)
      : (treeFromSections([{ type: "HeroSection" }, { type: "ProductGrid" }]) as unknown as Record<string, unknown>);

  const [pages, t] = await Promise.all([getTranslations("pages.store"), getTranslations("editor")]);
  return (
    <div className="space-y-6">
      <PageHeader
        title={pages("editorTitle")}
        description={pages("editorDescription")}
        actions={
          storefront?.published ? (
            <form action={revertStorefront}>
              <input type="hidden" name="storeId" value={storeId} />
              <Button type="submit" variant="outline">
                {t("revert")}
              </Button>
            </form>
          ) : null
        }
      />

      {published.length === 0 ? (
        <Callout tone="amber" title={t("noProductsTitle")}>
          {t("noProductsBody")}
        </Callout>
      ) : null}

      <StorefrontEditor
        storeId={storeId}
        storeSlug={store.slug}
        storeName={store.name}
        tree={tree}
        languages={locales}
        defaultLocale={defaultLocale}
        initialLocale={initialLocale}
        contexts={Object.fromEntries(perLocale.map(({ locale, context }) => [locale, context]))}
        chrome={Object.fromEntries(perLocale.map(({ locale, chrome }) => [locale, chrome]))}
        products={products
          .filter((p) => p.status !== "archived")
          .map((p) => ({
            id: p.id,
            name: p.name,
            href: `/app/stores/${storeId}/catalog/${p.id}`,
            fields: productFields(p),
            translations: p.translations ?? {},
          }))}
        collections={collections.map((c) => ({
          id: c.id,
          name: c.name,
          href: `/app/stores/${storeId}/catalog/collections/${c.id}`,
          fields: collectionFields(c),
          translations: c.translations ?? {},
        }))}
        portals={catalogues.map((c) => ({
          id: c.id,
          name: c.name,
          href: `/app/stores/${storeId}/gifting/${c.id}`,
          fields: [{ key: "intro", source: c.intro, long: true }],
          translations: c.translations ?? {},
        }))}
        shopText={shopText}
        publishedAt={storefront?.publishedAt ?? null}
        publishedBy={storefront?.publishedBy ?? null}
        draftUpdatedAt={storefront?.draftUpdatedAt ?? new Date().toISOString()}
        history={(storefront?.history ?? []).map((v) => ({
          id: v.id,
          label: v.label,
          savedAt: v.savedAt,
          savedBy: v.savedBy,
        }))}
      />
    </div>
  );
}

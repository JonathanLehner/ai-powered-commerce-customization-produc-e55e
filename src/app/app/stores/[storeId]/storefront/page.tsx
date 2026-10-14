import { getFormatter, getLocale, getMessages, getTranslations } from "next-intl/server";
import { revertStorefront } from "@/app/actions/storefront";
import { Callout, PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import type { StorefrontContext } from "@/components/sections";
import { collectionFields } from "@/lib/collections";
import { getStorefront, listGiftCatalogues, listProductCollections, listStoreProducts } from "@/lib/data";
import { formatMinorUnits } from "@/i18n/format";
import { isLocale, LOCALES } from "@/i18n/locales";
import { shopperMessages } from "@/i18n/storefront";
import { storeLanguages } from "@/i18n/storefront-routing";
import { requireStoreAccess } from "@/lib/session";
import { flattenShopText, shopTextEntries } from "@/lib/shop-text";
import { storefrontContext } from "@/lib/storefront-context";
import { generatedHomeSections } from "@/lib/storefront-defaults";
import { treeFromSections } from "@/lib/storefront-schema";
import { liveVersionId, summarizeSections, versionKind } from "@/lib/storefront-versions";
import { TEMPLATE_CATEGORIES, TEMPLATE_STYLES, TEMPLATES } from "@/lib/templates/index";
import { galleryTemplates } from "@/lib/templates/gallery";
import { draftDesign, treeTemplateId } from "@/lib/templates/tree";
import { productFields } from "@/lib/translations";
import type { ShopTextData } from "./ShopTextSheet";
import { StorefrontEditor } from "./StorefrontEditor";
import { TemplatePicker } from "./TemplatePicker";

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
      const context: StorefrontContext = storefrontContext({
        store,
        products: published,
        collections,
        locale,
        defaultLocale,
        base: `/s/${store.slug}`,
        preview: true,
        t: merged.storefront.sections,
        price: (p) => formatMinorUnits(format, p.price, p.currency),
      });
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

  // A store with no page yet starts from the one its storefront shows: built
  // from its products and name, in its default language.
  const defaultContext = (perLocale.find((entry) => entry.locale === defaultLocale) ?? perLocale[0]).context;
  const tree =
    storefront?.draft && Object.keys(storefront.draft).length > 0
      ? (storefront.draft as Record<string, unknown>)
      : (treeFromSections(
          generatedHomeSections({
            storeName: store.name,
            products: defaultContext.products,
            collections,
            copy: defaultContext.t.generated,
          }),
        ) as unknown as Record<string, unknown>);

  const [pages, t, templateText, uiLocale, untitled] = await Promise.all([
    getTranslations("pages.store"),
    getTranslations("editor"),
    getTranslations("templates"),
    getLocale().then((l) => (isLocale(l) ? l : "en")),
    // Older versions were saved under a placeholder name in whichever language
    // the editor was in; those are treated as unnamed and labelled for them.
    Promise.all(LOCALES.map((locale) => getTranslations({ locale, namespace: "editor" }).then((e) => e("untitled")))),
  ]);
  const placeholders = new Set(["Untitled version", ...untitled]);
  const history = storefront?.history ?? [];
  return (
    <div className="space-y-6">
      <PageHeader
        title={pages("editorTitle")}
        description={pages("editorDescription")}
        actions={
          <div className="flex flex-wrap gap-2">
            <TemplatePicker
              storeId={storeId}
              locale={initialLocale}
              templates={galleryTemplates(uiLocale)}
              categories={TEMPLATE_CATEGORIES.filter((c) => TEMPLATES.some((tpl) => tpl.category === c)).map((key) => ({
                key,
                label: templateText(`categories.${key}`),
              }))}
              styles={TEMPLATE_STYLES.map((key) => ({ key, label: templateText(`styles.${key}`) }))}
              currentTemplateId={treeTemplateId(tree)}
            />
            {storefront?.published ? (
              <form action={revertStorefront}>
                <input type="hidden" name="storeId" value={storeId} />
                <Button type="submit" variant="outline">
                  {t("revert")}
                </Button>
              </form>
            ) : null}
          </div>
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
        history={history.map((v) => ({
          id: v.id,
          label: placeholders.has(v.label) ? "" : v.label,
          kind: versionKind(v),
          savedAt: v.savedAt,
          savedBy: v.savedBy,
          sections: summarizeSections(v.data),
        }))}
        liveVersionId={liveVersionId(history, storefront?.published)}
        liveSections={storefront?.published ? summarizeSections(storefront.published) : null}
        design={draftDesign(tree) ?? { theme: store.theme, design: store.design ?? {} }}
      />
    </div>
  );
}

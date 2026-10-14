import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { PlainDocument } from "@/components/SiteChrome";
import { TemplateHome, TemplateShell } from "@/components/storefront/TemplateStorefront";
import { formatMinorUnits } from "@/i18n/format";
import { isLocale, type Locale } from "@/i18n/locales";
import { shopperMessages } from "@/i18n/storefront";
import { storeLanguages } from "@/i18n/storefront-routing";
import { getStore, listProductCollections, listStoreProducts } from "@/lib/data";
import { resolveDesign } from "@/lib/store-design";
import { storefrontContext } from "@/lib/storefront-context";
import { templatePreviewValid } from "@/lib/storefront-preview";
import { getTemplate } from "@/lib/templates/index";
import { demoCollections, demoProducts } from "@/lib/templates/demo";
import { templateTree } from "@/lib/templates/tree";

export async function generateMetadata({ params }: { params: Promise<{ template: string; lang: string }> }): Promise<Metadata> {
  const { template: id, lang } = await params;
  const template = getTemplate(id);
  const t = await getTranslations({ locale: isLocale(lang) ? lang : "en", namespace: "templates" });
  return { title: template ? t("demoTitle", { name: template.name }) : undefined, robots: { index: false, follow: false } };
}

/**
 * A store's own products in a template it has not applied yet, behind a
 * signed link from the editor's template picker or the Admin API's
 * previewTemplate. The link names the store, the template and its expiry.
 */
export default async function TemplatePreviewLayout({
  params,
}: {
  params: Promise<{ storeId: string; template: string; lang: string; expires: string; token: string }>;
}) {
  const { storeId, template: templateId, lang, expires, token } = await params;
  const locale: Locale = isLocale(lang) ? lang : "en";
  const template = getTemplate(templateId);
  const [valid, store] = await Promise.all([templatePreviewValid(storeId, templateId, expires, token), getStore(storeId)]);
  const t = await getTranslations({ locale, namespace: "templates" });
  if (!valid || !store || !template) {
    return (
      <PlainDocument note="© Parcelith">
        <div className="mx-auto w-full max-w-2xl px-4 py-24 text-center sm:px-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("previewExpired")}</h1>
          <p className="mt-3 text-sm text-muted-foreground">{t("previewExpiredBody")}</p>
        </div>
      </PlainDocument>
    );
  }

  const [all, collections, messages, format] = await Promise.all([
    listStoreProducts(store.id),
    listProductCollections(store.id),
    shopperMessages(store, locale),
    getFormatter({ locale }),
  ]);
  // The products a shopper would see; a store with none on sale yet shows its drafts that have photos.
  const published = all.filter((p) => p.status === "published");
  const products = published.length > 0 ? published : all.filter((p) => p.status !== "archived" && p.mockups.length > 0);
  const { defaultLocale } = storeLanguages(store);
  const tree = templateTree(template, { sourceLocale: locale, locales: [locale], brandName: store.name });
  const ctx =
    products.length > 0
      ? storefrontContext({
          store,
          products,
          collections,
          locale,
          defaultLocale,
          base: "#",
          preview: true,
          t: messages.storefront.sections,
          price: (p) => formatMinorUnits(format, p.price, p.currency),
        })
      : null;
  const sample = demoProducts(template, locale);
  const sampleCollections = demoCollections(template, sample);

  return (
    <TemplateShell
      template={template}
      locale={locale}
      base="#"
      brand={{ name: store.name, logoUrl: store.logoUrl }}
      collections={ctx?.collections ?? sampleCollections}
      notice={
        <p className="bg-neutral-950 px-4 py-2 text-center text-xs text-white">
          {products.length > 0 ? t("storePreviewNotice", { name: template.name }) : t("storePreviewSample", { name: template.name })}
        </p>
      }
    >
      <TemplateHome
        tree={tree}
        ctx={{
          ...(ctx ?? {
            storeName: store.name,
            clientName: store.clientName,
            base: "#",
            logoUrl: store.logoUrl,
            products: sample.map((p) => p.card),
            collections: sampleCollections,
            preview: true,
            t: messages.storefront.sections,
            locale,
          }),
          design: resolveDesign({ theme: template.theme, design: template.design }),
        }}
      />
    </TemplateShell>
  );
}

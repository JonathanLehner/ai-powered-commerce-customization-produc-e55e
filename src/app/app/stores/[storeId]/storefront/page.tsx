import { getFormatter, getMessages, getTranslations } from "next-intl/server";
import { revertStorefront } from "@/app/actions/storefront";
import { Callout, PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import type { StorefrontContext } from "@/components/sections";
import { getStorefront, listStoreProducts } from "@/lib/data";
import { formatMinorUnits } from "@/i18n/format";
import { storeLanguages } from "@/i18n/storefront-routing";
import { requireStoreAccess } from "@/lib/session";
import { treeFromSections } from "@/lib/storefront-schema";
import { StorefrontEditor } from "./StorefrontEditor";

export default async function StorefrontEditorPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const { store } = await requireStoreAccess(storeId, "store.storefront");
  const [storefront, products] = await Promise.all([getStorefront(storeId), listStoreProducts(storeId)]);

  const published = products.filter((p) => p.status === "published");
  // The preview reads the same messages and formatting the live storefront
  // does in its default language, so a store selling in German is edited
  // against German section copy.
  const { defaultLocale } = storeLanguages(store);
  const [messages, format] = await Promise.all([
    getMessages({ locale: defaultLocale }),
    getFormatter({ locale: defaultLocale }),
  ]);
  const context: StorefrontContext = {
    storeName: store.name,
    clientName: store.clientName,
    base: `/s/${store.slug}`,
    logoUrl: store.logoUrl,
    theme: store.theme,
    preview: true,
    t: messages.storefront.sections,
    products: published.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      price: formatMinorUnits(format, p.price, p.currency),
      imageUrl: p.mockups[0]?.url ?? null,
      tagline: p.description.split("\n")[0].slice(0, 110),
    })),
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
        tree={tree}
        context={context}
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

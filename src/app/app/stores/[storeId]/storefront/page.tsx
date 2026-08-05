import { revertStorefront } from "@/app/actions/storefront";
import { Callout, PageHeader } from "@/components/ui";
import type { StorefrontContext } from "@/components/sections";
import { getStorefront, listStoreProducts } from "@/lib/data";
import { storefrontLocale } from "@/lib/i18n";
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
  // The preview reads the same dictionary and locale the live storefront does,
  // so a store selling in German is edited against German section copy.
  const locale = storefrontLocale(store);
  const context: StorefrontContext = {
    storeName: store.name,
    clientName: store.clientName,
    slug: store.slug,
    logoUrl: store.logoUrl,
    theme: store.theme,
    preview: true,
    t: locale.t.sections,
    localeTag: locale.tag,
    products: published.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      price: p.price,
      currency: p.currency,
      imageUrl: p.mockups[0]?.url ?? null,
      tagline: p.description.split("\n")[0].slice(0, 110),
    })),
  };

  const tree =
    storefront?.draft && Object.keys(storefront.draft).length > 0
      ? (storefront.draft as Record<string, unknown>)
      : (treeFromSections([{ type: "HeroSection" }, { type: "ProductGrid" }]) as unknown as Record<string, unknown>);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Page editor"
        description="Arrange sections, edit their copy and preview at three widths. Shoppers keep seeing the published version until you publish."
        actions={
          storefront?.published ? (
            <form action={revertStorefront}>
              <input type="hidden" name="storeId" value={storeId} />
              <button type="submit" className="btn-secondary">
                Revert draft to published
              </button>
            </form>
          ) : null
        }
      />

      {published.length === 0 ? (
        <Callout tone="amber" title="No published products yet">
          Product grid sections will render empty until at least one product in this store is published.
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

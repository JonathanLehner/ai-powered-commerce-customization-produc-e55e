import { getTranslations } from "next-intl/server";
import { EmptyState, PageHeader } from "@/components/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasApprovedPreviews } from "@/lib/artwork";
import { listProductCollections, listStoreProducts } from "@/lib/data";
import { requireStoreAccess, roleCan } from "@/lib/session";
import { CatalogTabs } from "../CatalogTabs";
import { CollectionList, CreateCollectionForm } from "./CollectionForms";

export default async function CollectionsPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const { role } = await requireStoreAccess(storeId);
  const canEdit = roleCan(role, "store.catalog");
  const [collections, products, t] = await Promise.all([
    listProductCollections(storeId),
    listStoreProducts(storeId),
    getTranslations("collections"),
  ]);
  const live = new Set(
    products
      .filter((p) => p.status === "published" && p.visibility === "public" && hasApprovedPreviews(p))
      .map((p) => p.id),
  );
  const known = new Set(products.filter((p) => p.status !== "archived").map((p) => p.id));

  return (
    <div className="space-y-6">
      <CatalogTabs storeId={storeId} active="collections" />
      <PageHeader title={t("title")} description={t("description")} />

      {canEdit ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle asChild className="text-sm font-semibold">
              <h2>{t("newCollection")}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CreateCollectionForm storeId={storeId} />
          </CardContent>
        </Card>
      ) : null}

      {collections.length === 0 ? (
        <EmptyState title={t("emptyTitle")} description={canEdit ? t("emptyBody") : undefined} />
      ) : (
        <section aria-labelledby="collections-heading" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="collections-heading" className="text-sm font-semibold text-foreground">
              {t("listTitle", { count: collections.length })}
            </h2>
            {canEdit && collections.length > 1 ? (
              <p className="text-xs text-muted-foreground">{t("reorderHint")}</p>
            ) : null}
          </div>
          <CollectionList
            storeId={storeId}
            canEdit={canEdit}
            collections={collections.map((c) => {
              const ids = c.productIds.filter((id) => known.has(id));
              return {
                id: c.id,
                name: c.name,
                handle: c.handle,
                imageUrl: c.imageUrl,
                productCount: ids.length,
                liveCount: ids.filter((id) => live.has(id)).length,
              };
            })}
          />
        </section>
      )}
    </div>
  );
}

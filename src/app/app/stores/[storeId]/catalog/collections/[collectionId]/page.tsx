import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { deleteCollection } from "@/app/actions/collections";
import { ConfirmSubmit } from "@/components/forms";
import { StoreWorkspaceNotFoundView } from "@/components/NotFoundViews";
import { Breadcrumbs, Callout, PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasApprovedPreviews } from "@/lib/artwork";
import { getProductCollection, listStoreProducts } from "@/lib/data";
import { requireStoreAccess, roleCan } from "@/lib/session";
import { storeSku } from "@/lib/sku";
import { CatalogTabs } from "../../CatalogTabs";
import { CollectionDetailsForm, CollectionProducts } from "./CollectionEditor";

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string; collectionId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const [{ storeId, collectionId }, { created }] = await Promise.all([params, searchParams]);
  const { store, role } = await requireStoreAccess(storeId);
  const [collection, products, t, labels] = await Promise.all([
    getProductCollection(collectionId),
    listStoreProducts(storeId),
    getTranslations("collections"),
    getTranslations("labels"),
  ]);
  // A collection that is gone (or belongs to another store) shows the store's
  // own not-found page, rendered here so it arrives as HTML with the store nav.
  if (!collection || collection.storeId !== storeId) {
    return <StoreWorkspaceNotFoundView base={`/app/stores/${storeId}`} />;
  }
  const canEdit = roleCan(role, "store.catalog");
  const base = `/app/stores/${storeId}/catalog/collections`;
  const liveHref = `/s/${store.slug}/collections/${collection.handle}`;

  return (
    <div className="space-y-6">
      <CatalogTabs storeId={storeId} active="collections" />
      <div>
        <Breadcrumbs
          label={t("breadcrumb")}
          items={[{ label: t("title"), href: base }, { label: collection.name }]}
        />
        <PageHeader
          title={collection.name}
          actions={
            <Button asChild variant="outline">
              <Link href={liveHref} target="_blank" rel="noreferrer" prefetch={false}>
                {t("viewLive")}
              </Link>
            </Button>
          }
        />
      </div>

      {created ? (
        <Callout tone="green" title={t("createdTitle")}>
          {t("createdBody")}
        </Callout>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
        <Card size="sm">
          <CardHeader>
            <CardTitle asChild className="text-sm font-semibold">
              <h2>{t("details")}</h2>
            </CardTitle>
            <p className="text-xs text-muted-foreground">{t("detailsHint")}</p>
          </CardHeader>
          <CardContent>
            <CollectionDetailsForm
              storeId={storeId}
              canEdit={canEdit}
              collection={{
                id: collection.id,
                name: collection.name,
                handle: collection.handle,
                description: collection.description,
                imageUrl: collection.imageUrl,
              }}
            />
          </CardContent>
        </Card>

        <CollectionProducts
          className="lg:row-span-2"
          storeId={storeId}
          collectionId={collection.id}
          canEdit={canEdit}
          initialIds={collection.productIds}
          products={products
            .filter((p) => p.status !== "archived")
            .map((p) => {
              const live = p.status === "published" && p.visibility === "public" && hasApprovedPreviews(p);
              return {
                id: p.id,
                name: p.name,
                sku: storeSku(p, store.channelCode),
                imageUrl: p.mockups[0]?.url ?? null,
                live,
                statusLabel:
                  p.status === "published" ? t("notOnSale") : labels(`productStatus.${p.status}`),
              };
            })}
        />

        {canEdit ? (
          <Card size="sm" className="lg:col-start-1">
            <CardHeader>
              <CardTitle asChild className="text-sm font-semibold">
                <h2>{t("deleteTitle")}</h2>
              </CardTitle>
              <p className="text-xs text-muted-foreground">{t("deleteBody")}</p>
            </CardHeader>
            <CardContent>
              <form action={deleteCollection}>
                <input type="hidden" name="storeId" value={storeId} />
                <input type="hidden" name="collectionId" value={collection.id} />
                <ConfirmSubmit confirmLabel={t("deleteConfirm")} variant="destructive" size="sm">
                  {t("delete")}
                </ConfirmSubmit>
              </form>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

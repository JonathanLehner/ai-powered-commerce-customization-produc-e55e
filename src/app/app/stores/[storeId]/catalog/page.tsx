import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { Badge, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { listStoreProducts, listTaxBrackets } from "@/lib/data";
import type { BulkProduct } from "@/lib/bulk-products";
import { marginTone } from "@/lib/pricing";
import { publishBlockersFor } from "@/lib/publish-blockers";
import { requireStoreAccess, roleCan } from "@/lib/session";
import { storeSku } from "@/lib/sku";
import type { StoreProduct } from "@/lib/types";
import { formatAgo } from "@/i18n/format";
import { formatDate, formatMoney, formatPercent } from "@/lib/util";
import { BulkActionBar, CatalogSelection, ProductCheckbox, SelectableItem } from "./CatalogSelection";
import { CatalogTabs } from "./CatalogTabs";
import { CatalogToolbar } from "./CatalogToolbar";
import { UnpublishButton } from "./UnpublishButton";

const STATUS_TONES: Record<StoreProduct["status"], "green" | "amber" | "neutral" | "slate"> = {
  published: "green",
  in_review: "amber",
  draft: "neutral",
  archived: "slate",
};

export default async function StoreCatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { storeId } = await params;
  const { status, q } = await searchParams;
  const { store, role } = await requireStoreAccess(storeId);
  const products = await listStoreProducts(storeId);
  const canEdit = roleCan(role, "store.catalog");

  const filtered = products
    .filter((p) => !status || p.status === status)
    .filter((p) =>
      !q
        ? true
        : `${p.name} ${storeSku(p, store.channelCode)} ${p.tags.join(" ")} ${p.description}`
            .toLowerCase()
            .includes(q.toLowerCase()),
    );

  const published = products.filter((p) => p.status === "published");
  const avgMargin =
    published.length > 0
      ? published.reduce((sum, p) => sum + p.costs.marginPct, 0) / published.length
      : 0;

  const [pages, t, labels, locale, format, brackets, blockers] = await Promise.all([
    getTranslations("pages.store"),
    getTranslations("catalog"),
    getTranslations("labels"),
    getLocale(),
    getFormatter(),
    canEdit ? listTaxBrackets() : [],
    // What stops each unpublished product going live, so bulk Publish can say
    // up front which ones it will skip.
    canEdit ? publishBlockersFor(filtered.filter((p) => p.status !== "published")) : new Map<string, { reason: string }[]>(),
  ]);
  const bulkProducts: BulkProduct[] = filtered.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    visibility: p.visibility,
    taxBracketId: p.taxBracketId,
    price: p.price,
    currency: p.currency,
    variants: p.variants.map((v) => ({ id: v.id, enabled: v.enabled, price: v.price, baseCost: v.baseCost })),
    costs: {
      supplierCost: p.costs.supplierCost,
      customizationCost: p.costs.customizationCost,
      shippingEstimate: p.costs.shippingEstimate,
      taxRate: p.costs.taxRate,
      marginAmount: p.costs.marginAmount,
      marginPct: p.costs.marginPct,
    },
    publishBlockers: (blockers.get(p.id) ?? []).map((b) => b.reason),
  }));
  const now = new Date();
  return (
    <div className="space-y-6">
      <CatalogTabs storeId={storeId} active="products" />
      <PageHeader
        title={pages("productsTitle")}
        actions={
          canEdit ? (
            <Button asChild>
              <Link href={`/app/stores/${storeId}/sourcing`}>{t("import")}</Link>
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("products")} value={String(products.length)} />
        <StatCard label={t("published")} value={String(published.length)} />
        <StatCard
          label={t("drafts")}
          value={String(products.filter((p) => p.status !== "published" && p.status !== "archived").length)}
        />
        <StatCard
          label={t("averageMargin")}
          value={formatPercent(avgMargin)}
          tone={marginTone(avgMargin) === "healthy" ? "green" : marginTone(avgMargin) === "thin" ? "amber" : "rose"}
          sub={t("publishedProducts")}
        />
      </div>

      <CatalogToolbar base={`/app/stores/${storeId}/catalog`} q={q ?? ""} status={status ?? ""} />

      {filtered.length === 0 ? (
        <EmptyState
          title={products.length === 0 ? t("noProducts") : t("noMatches")}
          description={products.length === 0 ? t("noProductsBody") : t("tryFilters")}
          action={
            canEdit ? (
              <Button asChild>
                <Link href={`/app/stores/${storeId}/sourcing`}>{t("browse")}</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        // Keyed on the filters, so changing them starts with nothing ticked.
        <CatalogSelection key={`${status ?? ""}|${q ?? ""}`} products={bulkProducts}>
        <div className="space-y-4">
        {canEdit ? (
          <BulkActionBar
            storeId={storeId}
            brackets={brackets.map((b) => ({ id: b.id, name: b.name, rate: b.rate }))}
            pricesIncludeTax={store.pricesIncludeTax}
          />
        ) : null}
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((product) => {
            const cover = product.mockups[0];
            const tone = marginTone(product.costs.marginPct);
            return (
              <SelectableItem key={product.id} id={product.id} className="flex">
                <Card className="flex-1 gap-0 py-0 group-data-[state=selected]:ring-2 group-data-[state=selected]:ring-primary">
                  <div className="relative border-b border-border bg-canvas">
                    {cover ? (
                      <Image
                        src={cover.url}
                        alt={t("mockupAlt", { name: product.name })}
                        width={640}
                        height={640}
                        loading="lazy"
                        sizes="(min-width: 1280px) 380px, (min-width: 768px) 45vw, 90vw"
                        className="h-auto w-full object-cover"
                        style={{ aspectRatio: "1 / 1" }}
                      />
                    ) : (
                      <div
                        className="flex w-full items-center justify-center text-sm text-muted-foreground"
                        style={{ aspectRatio: "1 / 1" }}
                      >
                        {t("noMockup")}
                      </div>
                    )}
                    <span className="absolute top-3 left-3 flex items-center gap-2">
                      {canEdit ? <ProductCheckbox id={product.id} name={product.name} /> : null}
                      <Badge tone={STATUS_TONES[product.status]}>{labels(`productStatus.${product.status}`)}</Badge>
                    </span>
                    {product.visibility === "hidden" ? (
                      <span className="absolute top-3 right-3">
                        <Badge tone="slate">{t("hidden")}</Badge>
                      </span>
                    ) : null}
                  </div>

                  <CardContent className="flex flex-1 flex-col py-4">
                    <h3 className="text-sm font-semibold text-foreground">
                      <Link href={`/app/stores/${storeId}/catalog/${product.id}`} className="hover:underline">
                        {product.name}
                      </Link>
                    </h3>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {storeSku(product, store.channelCode)}
                    </p>
                    {product.manualFulfilment ? (
                      <p className="mt-1.5">
                        <Badge tone="iris">{t("manualFulfilment", { code: product.manualFulfilment.quoteCode })}</Badge>
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("meta", {
                        count: product.variants.filter((v) => v.enabled).length,
                        imported: formatDate(product.importedAt, locale),
                        updated: formatAgo(format, product.updatedAt, now),
                      })}
                    </p>

                    <dl className="mt-3 grid grid-cols-3 gap-2 border-y border-border py-3 text-xs">
                      <div>
                        <dt className="text-muted-foreground">{t("price")}</dt>
                        <dd className="font-semibold tabular-nums text-foreground">
                          {formatMoney(product.price, product.currency, locale)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{t("cost")}</dt>
                        <dd className="font-semibold tabular-nums text-foreground">
                          {formatMoney(
                            product.costs.supplierCost +
                              product.costs.customizationCost +
                              product.costs.shippingEstimate,
                            product.currency,
                            locale,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{t("margin")}</dt>
                        <dd
                          className={
                            tone === "healthy"
                              ? "font-semibold tabular-nums text-emerald-700"
                              : tone === "thin"
                                ? "font-semibold tabular-nums text-amber-700"
                                : "font-semibold tabular-nums text-rose-700"
                          }
                        >
                          {formatPercent(product.costs.marginPct)}
                        </dd>
                      </div>
                    </dl>
                  </CardContent>

                  <CardFooter className="mt-auto flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/app/stores/${storeId}/catalog/${product.id}`}>
                        {canEdit ? t("edit") : t("view")}
                      </Link>
                    </Button>
                    {canEdit && product.status === "published" ? (
                      <UnpublishButton storeId={storeId} productId={product.id} name={product.name} />
                    ) : null}
                    {product.status === "published" ? (
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          href={`/s/${store.slug}/products/${product.slug}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {t("viewLive")}
                        </Link>
                      </Button>
                    ) : null}
                  </CardFooter>
                </Card>
              </SelectableItem>
            );
          })}
        </ul>
        </div>
        </CatalogSelection>
      )}
    </div>
  );
}

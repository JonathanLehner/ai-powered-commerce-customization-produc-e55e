import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { StoreWorkspaceNotFoundView } from "@/components/NotFoundViews";
import {
  approveMockups,
  publishBlockers,
  rejectMockups,
  setProductStatus,
} from "@/app/actions/products";
import { SubmitButton } from "@/components/forms";
import { Badge, Breadcrumbs, Callout, DataList, PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasApprovedPreviews } from "@/lib/artwork";
import {
  getCatalogProduct,
  getStoreProduct,
  getSupplier,
  listTaxBrackets,
  updateStoreProduct,
} from "@/lib/data";
import { marginTone } from "@/lib/pricing";
import { takeOffFailingPreflight } from "@/lib/preflight-guard";
import { requireStoreAccess, roleCan } from "@/lib/session";
import { storeSku } from "@/lib/sku";
import { formatDate, formatDateTime, formatMoney, formatPercent } from "@/lib/util";
import { Configurator } from "./Configurator";
import { DeleteProductForm, ProductDetailsForm, VariantsForm } from "./ProductForms";

export default async function ProductEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string; productId: string }>;
  searchParams: Promise<{ imported?: string }>;
}) {
  const { storeId, productId } = await params;
  const { imported } = await searchParams;

  // The access check and the product are independent reads, and each one is a
  // round trip to the platform, so they go out together.
  const [{ store, role }, stored] = await Promise.all([
    requireStoreAccess(storeId),
    getStoreProduct(productId),
  ]);
  const canEdit = roleCan(role, "store.catalog");
  // A record that is gone (or belongs to another store) shows the store's own
  // not-found page, rendered here so it arrives as HTML with the store nav.
  if (!stored || stored.storeId !== storeId)
    return <StoreWorkspaceNotFoundView base={`/app/stores/${storeId}`} />;

  // Artwork and mockup writes demote a published product themselves, but a
  // record saved before that guard existed can still be sitting on the
  // storefront with nothing approved. Correct it on sight, so the page never
  // shows "published" next to the reasons it cannot be published.
  const stale = stored.status === "published" && !hasApprovedPreviews(stored);
  const corrected = stale
    ? { ...stored, status: "in_review" as const, unpublishedReason: "artwork_changed" as const }
    : stored;
  if (stale) {
    await updateStoreProduct(stored.id, { status: "in_review", unpublishedReason: "artwork_changed" }, stored);
  }

  const [catalog, supplier, brackets, blockers] = await Promise.all([
    getCatalogProduct(corrected.catalogProductId),
    getSupplier(corrected.supplierId),
    listTaxBrackets(),
    publishBlockers(productId),
  ]);
  // Likewise a live product whose artwork now fails the supplier's file check.
  const [product] = await takeOffFailingPreflight([corrected], new Map([[corrected.catalogProductId, catalog]]));

  const bracket = brackets.find((b) => b.id === product.taxBracketId) ?? null;
  const costs = product.costs;
  const landed = costs.supplierCost + costs.customizationCost + costs.shippingEstimate;
  const tone = marginTone(costs.marginPct);
  const mockupsApproved = product.mockups.length > 0 && product.mockups.every((m) => m.approved);
  const sku = storeSku(product, store.channelCode);
  const printAreaCount = new Set(product.artworks.map((a) => a.printAreaId)).size;
  const unpublished = product.status !== "published";
  const artworkChanged = product.unpublishedReason === "artwork_changed" && unpublished;
  const preflightFailed =
    product.unpublishedReason === "preflight_failed" && product.status === "in_review" && blockers.length > 0;
  const showBlockers = blockers.length > 0 && unpublished;
  const [t, labels, locale] = await Promise.all([
    getTranslations("product"),
    getTranslations("labels"),
    getLocale(),
  ]);
  const money = (minor: number) => formatMoney(minor, product.currency, locale);

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: store.name, href: `/app/stores/${storeId}` },
          { label: t("catalog"), href: `/app/stores/${storeId}/catalog` },
          { label: product.name },
        ]}
      />

      <PageHeader
        title={product.name}
        description={
          <>
            <span className="font-mono">{sku}</span> ·{" "}
            {product.category === "apparel" ? t("apparel") : t("drinkware")} ·{" "}
            {t("enabledVariants", { count: product.variants.filter((v) => v.enabled).length })}
            {supplier ? t("producedBy", { supplier: supplier.name }) : ""} ·{" "}
            {t("importedBy", { name: product.importedBy, date: formatDate(product.importedAt, locale) })}
          </>
        }
        actions={
          <>
            <Badge tone={product.status === "published" ? "green" : product.status === "in_review" ? "amber" : "neutral"}>
              {labels(`productStatus.${product.status}`)}
            </Badge>
            {product.status === "published" ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/s/${store.slug}/products/${product.slug}`} target="_blank" rel="noreferrer">
                  {t("viewLive")}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      {imported === "copy" ? (
        <Callout tone="amber" title={t("copyTitle")}>
          {t.rich("copyBody", {
            name: product.name,
            sku,
            code: (chunks) => <span className="font-mono">{chunks}</span>,
          })}{" "}
          {canEdit ? (
            <a href="#name" className="font-medium underline underline-offset-2">
              {t("renameNow")}
            </a>
          ) : null}
        </Callout>
      ) : imported ? (
        <Callout tone="green" title={t("copiedTitle")}>
          {t.rich("copiedBody", { sku, code: (chunks) => <span className="font-mono">{chunks}</span> })}
        </Callout>
      ) : null}

      {product.manualFulfilment ? (
        <Callout tone="neutral" title={t("manualTitle")}>
          {t("manualBody", {
            code: product.manualFulfilment.quoteCode,
            supplier: product.manualFulfilment.supplierLabel,
            cost: money(product.manualFulfilment.unitCost),
            minimum: product.manualFulfilment.minimumOrderQuantity.toLocaleString(locale),
          })}
        </Callout>
      ) : null}

      {/* ------------------------------------------------------ publishing */}
      <Card asChild>
      <section>
          <CardHeader>
            <CardTitle asChild>
              <h2>{t("publication")}</h2>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {product.status === "published"
                ? t("live")
                : blockers.length === 0
                  ? t("ready")
                  : t("issues", { count: blockers.length })}
            </p>
            {canEdit ? (
              <CardAction className="flex flex-wrap gap-2">
              {product.status !== "published" ? (
                <form action={setProductStatus}>
                  <input type="hidden" name="storeId" value={storeId} />
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="status" value="published" />
                  <SubmitButton pendingLabel={t("publishing")} disabled={blockers.length > 0}>
                    {t("publish")}
                  </SubmitButton>
                </form>
              ) : (
                <form action={setProductStatus}>
                  <input type="hidden" name="storeId" value={storeId} />
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="status" value="in_review" />
                  <SubmitButton variant="outline" pendingLabel={t("unpublishing")}>
                    {t("unpublish")}
                  </SubmitButton>
                </form>
              )}
              {product.status !== "archived" ? (
                <form action={setProductStatus}>
                  <input type="hidden" name="storeId" value={storeId} />
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="status" value="archived" />
                  <SubmitButton variant="ghost" pendingLabel={t("archiving")}>
                    {t("archive")}
                  </SubmitButton>
                </form>
              ) : (
                <form action={setProductStatus}>
                  <input type="hidden" name="storeId" value={storeId} />
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="status" value="draft" />
                  <SubmitButton variant="outline" pendingLabel={t("restoring")}>
                    {t("restore")}
                  </SubmitButton>
                </form>
              )}
              </CardAction>
            ) : null}
          </CardHeader>

          {artworkChanged || preflightFailed || showBlockers ? (
            <CardContent className="space-y-4">
              {artworkChanged ? (
                <Callout tone="amber" title={t("takenOffTitle")}>
                  {t("takenOffBody")}
                </Callout>
              ) : preflightFailed ? (
                <Callout tone="amber" title={t("takenOffTitle")}>
                  {t("takenOffPreflightBody")}
                </Callout>
              ) : null}

              {showBlockers ? (
                <ul className="space-y-2.5" role="alert">
                  {blockers.map((blocker, index) => (
                    <li key={index} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <p className="text-sm font-medium text-amber-900">{blocker.reason}</p>
                      <p className="mt-1 text-xs text-amber-800">{t("howToFix", { fix: blocker.fix })}</p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          ) : null}
      </section>
      </Card>

      {/* ---------------------------------------------------- configurator */}
      <Card asChild>
      <section>
          <CardHeader>
            <CardTitle asChild>
              <h2>{t("artwork")}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {catalog ? (
              <Configurator product={product} catalog={catalog} readOnly={!canEdit} />
            ) : (
              <Callout tone="rose" title={t("retiredTitle")}>
                {t("retiredBody")}
              </Callout>
            )}
          </CardContent>
      </section>
      </Card>

      {/* --------------------------------------------------------- mockups */}
      <Card asChild>
      <section>
          <CardHeader>
            <CardTitle asChild>
              <h2>{t("mockupApproval")}</h2>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {product.mockups.length === 0
                ? t("noMockups")
                : mockupsApproved
                  ? t("approvedBy", {
                      name: product.mockups[0].approvedBy ?? "",
                      date: formatDateTime(product.mockups[0].approvedAt ?? product.mockups[0].generatedAt, locale),
                    })
                  : t("approvalRequired")}
            </p>
            {canEdit && product.mockups.length > 0 ? (
              <CardAction className="flex gap-2">
              {!mockupsApproved ? (
                <form action={approveMockups}>
                  <input type="hidden" name="storeId" value={storeId} />
                  <input type="hidden" name="productId" value={product.id} />
                  <SubmitButton size="sm" pendingLabel={t("approving")}>
                    {t("approve", { count: product.mockups.length })}
                  </SubmitButton>
                </form>
              ) : null}
              <form action={rejectMockups}>
                <input type="hidden" name="storeId" value={storeId} />
                <input type="hidden" name="productId" value={product.id} />
                <SubmitButton variant="ghost" size="sm" pendingLabel={t("clearing")}>
                  {t("reject")}
                </SubmitButton>
              </form>
              </CardAction>
            ) : null}
          </CardHeader>

          {product.mockups.length > 0 ? (
            <CardContent>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {product.mockups.map((mockup) => (
              <li key={mockup.id} className="overflow-hidden rounded-xl border border-border">
                <Image
                  src={mockup.url}
                  alt={t("viewAlt", { name: product.name, view: labels(`view.${mockup.view}`) })}
                  width={640}
                  height={640}
                  loading="lazy"
                  sizes="(min-width: 1024px) 320px, 90vw"
                  className="h-auto w-full bg-canvas object-cover"
                  style={{ aspectRatio: "1 / 1" }}
                />
                <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
                  <span className="text-sm font-medium text-foreground">{labels(`view.${mockup.view}`)}</span>
                  <Badge tone={mockup.approved ? "green" : "amber"}>
                    {mockup.approved ? t("approved") : t("awaitingApproval")}
                  </Badge>
                </div>
              </li>
            ))}
            </ul>
            </CardContent>
          ) : null}
      </section>
      </Card>

      {/* ------------------------------------------------------------ costs */}
      <Card asChild>
      <section>
          <CardHeader>
            <CardTitle asChild>
              <h2>{t("costs")}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-6 lg:grid-cols-2">
              <DataList
                rows={[
                  {
                    label: t("supplierCost"),
                    value: (
                      <span className="tabular-nums">
                        {money(costs.supplierCost)}
                      </span>
                    ),
                  },
                  {
                    label: t("customisation", { count: printAreaCount }),
                    value: (
                      <span className="tabular-nums">
                        {money(costs.customizationCost)}
                      </span>
                    ),
                  },
                  {
                    label: t("shipping"),
                    value: (
                      <span className="tabular-nums">
                        {money(costs.shippingEstimate)}
                      </span>
                    ),
                  },
                  {
                    label: t("landed"),
                    value: (
                      <span className="font-semibold tabular-nums">
                        {money(landed)}
                      </span>
                    ),
                  },
                ]}
              />

              <DataList
                rows={[
                  {
                    label: t("taxBracket"),
                    value: bracket ? `${bracket.name} · ${bracket.rate}%` : t("notSelected"),
                  },
                  {
                    label: store.pricesIncludeTax ? t("taxIncluded") : t("taxAdded"),
                    value: (
                      <span className="tabular-nums">{money(costs.taxAmount)}</span>
                    ),
                  },
                  {
                    label: t("sellingPrice"),
                    value: (
                      <span className="font-semibold tabular-nums">
                        {money(costs.sellingPrice)}
                      </span>
                    ),
                  },
                  {
                    label: t("margin"),
                    value: (
                      <span
                        className={
                          tone === "healthy"
                            ? "font-semibold tabular-nums text-emerald-700"
                            : tone === "thin"
                              ? "font-semibold tabular-nums text-amber-700"
                              : "font-semibold tabular-nums text-rose-700"
                        }
                      >
                        {money(costs.marginAmount)} ·{" "}
                        {formatPercent(costs.marginPct)}
                      </span>
                    ),
                  },
                ]}
              />
            </div>
            {tone !== "healthy" ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {tone === "negative"
                  ? t("belowCost")
                  : t("thinMargin")}
              </p>
            ) : null}
          </CardContent>
      </section>
      </Card>

      {canEdit ? <ProductDetailsForm product={product} brackets={brackets} textArea={catalog?.printAreas[0]?.name ?? null} /> : null}
      {canEdit ? <VariantsForm product={product} /> : null}

      {canEdit ? <DeleteProductForm product={product} /> : null}
    </div>
  );
}

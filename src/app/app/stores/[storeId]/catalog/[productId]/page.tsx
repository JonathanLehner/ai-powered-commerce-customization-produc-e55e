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
import { requireStoreAccess, roleCan } from "@/lib/session";
import { storeSku } from "@/lib/sku";
import { VIEW_LABELS } from "@/lib/types";
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
  const product = stale
    ? { ...stored, status: "in_review" as const, unpublishedReason: "artwork_changed" as const }
    : stored;
  if (stale) {
    await updateStoreProduct(stored.id, { status: "in_review", unpublishedReason: "artwork_changed" }, stored);
  }

  const [catalog, supplier, brackets, blockers] = await Promise.all([
    getCatalogProduct(product.catalogProductId),
    getSupplier(product.supplierId),
    listTaxBrackets(),
    publishBlockers(productId),
  ]);

  const bracket = brackets.find((b) => b.id === product.taxBracketId) ?? null;
  const costs = product.costs;
  const landed = costs.supplierCost + costs.customizationCost + costs.shippingEstimate;
  const tone = marginTone(costs.marginPct);
  const mockupsApproved = product.mockups.length > 0 && product.mockups.every((m) => m.approved);
  const sku = storeSku(product, store.channelCode);
  const printAreaCount = new Set(product.artworks.map((a) => a.printAreaId)).size;
  const unpublished = product.status !== "published";
  const artworkChanged = product.unpublishedReason === "artwork_changed" && unpublished;
  const showBlockers = blockers.length > 0 && unpublished;

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: store.name, href: `/app/stores/${storeId}` },
          { label: "Catalog", href: `/app/stores/${storeId}/catalog` },
          { label: product.name },
        ]}
      />

      <PageHeader
        title={product.name}
        description={
          <>
            <span className="font-mono">{sku}</span> ·{" "}
            {product.category === "apparel" ? "Apparel" : "Drinkware"} ·{" "}
            {product.variants.filter((v) => v.enabled).length} enabled variants
            {supplier ? ` · produced by ${supplier.name}` : ""} · imported by {product.importedBy} on{" "}
            {formatDate(product.importedAt)}
          </>
        }
        actions={
          <>
            <Badge tone={product.status === "published" ? "green" : product.status === "in_review" ? "amber" : "neutral"}>
              {product.status.replace("_", " ")}
            </Badge>
            {product.status === "published" ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/s/${store.slug}/products/${product.slug}`} target="_blank" rel="noreferrer">
                  View live ↗
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      {imported === "copy" ? (
        <Callout tone="amber" title="A second copy — give it a name of its own">
          {store.name} already held this supplier product, so this copy was saved as “{product.name}” with SKU{" "}
          <span className="font-mono">{sku}</span>. Rename it to something the team will recognise — the
          earlier copy and the shared catalog record are both untouched.{" "}
          {canEdit ? (
            <a href="#name" className="font-medium underline underline-offset-2">
              Rename it now
            </a>
          ) : null}
        </Callout>
      ) : imported ? (
        <Callout tone="green" title="Copied into this store">
          A private copy now sits in {store.name} as <span className="font-mono">{sku}</span>. Place artwork,
          generate mockups and check the margin — the shared catalog record is untouched.
        </Callout>
      ) : null}

      {product.manualFulfilment ? (
        <Callout tone="neutral" title="Flagged for manual fulfilment">
          Sourced under accepted quote {product.manualFulfilment.quoteCode} from{" "}
          {product.manualFulfilment.supplierLabel} at{" "}
          {formatMoney(product.manualFulfilment.unitCost, product.currency)} a unit, minimum{" "}
          {product.manualFulfilment.minimumOrderQuantity.toLocaleString("en-US")} units. Orders for it are not
          sent to a supplier API: each one is held for a buyer to raise the purchase order against that quote.
        </Callout>
      ) : null}

      {/* ------------------------------------------------------ publishing */}
      <Card asChild>
      <section>
          <CardHeader>
            <CardTitle asChild>
              <h2>Publication</h2>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {product.status === "published"
                ? "This product is live on the storefront."
                : blockers.length === 0
                  ? "Every pre-flight check passes. This product is ready to sell."
                  : `${blockers.length} thing${blockers.length === 1 ? "" : "s"} must be resolved before this product can be published.`}
            </p>
            {canEdit ? (
              <CardAction className="flex flex-wrap gap-2">
              {product.status !== "published" ? (
                <form action={setProductStatus}>
                  <input type="hidden" name="storeId" value={storeId} />
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="status" value="published" />
                  <SubmitButton pendingLabel="Publishing…" disabled={blockers.length> 0}>
                    Publish to storefront
                  </SubmitButton>
                </form>
              ) : (
                <form action={setProductStatus}>
                  <input type="hidden" name="storeId" value={storeId} />
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="status" value="in_review" />
                  <SubmitButton variant="outline" pendingLabel="Unpublishing…">
                    Unpublish
                  </SubmitButton>
                </form>
              )}
              {product.status !== "archived" ? (
                <form action={setProductStatus}>
                  <input type="hidden" name="storeId" value={storeId} />
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="status" value="archived" />
                  <SubmitButton variant="ghost" pendingLabel="Archiving…">
                    Archive
                  </SubmitButton>
                </form>
              ) : (
                <form action={setProductStatus}>
                  <input type="hidden" name="storeId" value={storeId} />
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="status" value="draft" />
                  <SubmitButton variant="outline" pendingLabel="Restoring…">
                    Restore to draft
                  </SubmitButton>
                </form>
              )}
              </CardAction>
            ) : null}
          </CardHeader>

          {artworkChanged || showBlockers ? (
            <CardContent className="space-y-4">
              {artworkChanged ? (
                <Callout tone="amber" title="Taken off the storefront">
                  This product was taken off the storefront because the artwork changed. Regenerate the
                  previews and approve them to republish.
                </Callout>
              ) : null}

              {showBlockers ? (
                <ul className="space-y-2.5" role="alert">
                  {blockers.map((blocker, index) => (
                    <li key={index} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <p className="text-sm font-medium text-amber-900">{blocker.reason}</p>
                      <p className="mt-1 text-xs text-amber-800">How to fix: {blocker.fix}</p>
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
              <h2>Artwork and print areas</h2>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Position the design inside the printable rectangle. Every check below reflects the
              supplier&rsquo;s own file and resolution requirements.
            </p>
          </CardHeader>
          <CardContent>
            {catalog ? (
              <Configurator product={product} catalog={catalog} readOnly={!canEdit} />
            ) : (
              <Callout tone="rose" title="Supplier product retired">
                The shared catalog entry behind this product no longer exists, so artwork cannot be
                pre-flighted. Import a replacement from the supplier catalog.
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
              <h2>Mockup approval</h2>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {product.mockups.length === 0
                ? "No previews yet. Generate them from the artwork panel above."
                : mockupsApproved
                  ? `Approved by ${product.mockups[0].approvedBy} on ${formatDateTime(product.mockups[0].approvedAt ?? product.mockups[0].generatedAt)}.`
                  : "Review each view. Approval is required before the product can be published."}
            </p>
            {canEdit && product.mockups.length > 0 ? (
              <CardAction className="flex gap-2">
              {!mockupsApproved ? (
                <form action={approveMockups}>
                  <input type="hidden" name="storeId" value={storeId} />
                  <input type="hidden" name="productId" value={product.id} />
                  <SubmitButton size="sm" pendingLabel="Approving…">
                    Approve {product.mockups.length} preview{product.mockups.length === 1 ? "" : "s"}
                  </SubmitButton>
                </form>
              ) : null}
              <form action={rejectMockups}>
                <input type="hidden" name="storeId" value={storeId} />
                <input type="hidden" name="productId" value={product.id} />
                <SubmitButton variant="ghost" size="sm" pendingLabel="Clearing…">
                  Reject and start over
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
                  alt={`${product.name}, ${VIEW_LABELS[mockup.view]} view`}
                  width={640}
                  height={640}
                  loading="lazy"
                  sizes="(min-width: 1024px) 320px, 90vw"
                  className="h-auto w-full bg-canvas object-cover"
                  style={{ aspectRatio: "1 / 1" }}
                />
                <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
                  <span className="text-sm font-medium text-foreground">{VIEW_LABELS[mockup.view]}</span>
                  <Badge tone={mockup.approved ? "green" : "amber"}>
                    {mockup.approved ? "Approved" : "Awaiting approval"}
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
              <h2>Cost, tax and margin</h2>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Everything a decision needs before publishing. Margin is measured against net revenue, because
              the seller remits the tax.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-6 lg:grid-cols-2">
              <DataList
                rows={[
                  {
                    label: "Supplier cost (cheapest enabled variant)",
                    value: (
                      <span className="tabular-nums">
                        {formatMoney(costs.supplierCost, product.currency)}
                      </span>
                    ),
                  },
                  {
                    label: `Customisation (${printAreaCount} print area${printAreaCount === 1 ? "" : "s"})`,
                    value: (
                      <span className="tabular-nums">
                        {formatMoney(costs.customizationCost, product.currency)}
                      </span>
                    ),
                  },
                  {
                    label: "Estimated shipping",
                    value: (
                      <span className="tabular-nums">
                        {formatMoney(costs.shippingEstimate, product.currency)}
                      </span>
                    ),
                  },
                  {
                    label: "Landed cost",
                    value: (
                      <span className="font-semibold tabular-nums">
                        {formatMoney(landed, product.currency)}
                      </span>
                    ),
                  },
                ]}
              />

              <DataList
                rows={[
                  {
                    label: "Tax bracket",
                    value: bracket ? `${bracket.name} · ${bracket.rate}%` : "Not selected",
                  },
                  {
                    label: `Tax ${store.pricesIncludeTax ? "included in price" : "added at checkout"}`,
                    value: (
                      <span className="tabular-nums">{formatMoney(costs.taxAmount, product.currency)}</span>
                    ),
                  },
                  {
                    label: "Selling price",
                    value: (
                      <span className="font-semibold tabular-nums">
                        {formatMoney(costs.sellingPrice, product.currency)}
                      </span>
                    ),
                  },
                  {
                    label: "Margin",
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
                        {formatMoney(costs.marginAmount, product.currency)} ·{" "}
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
                  ? "This product would sell at a loss. Raise the price or pick a cheaper supplier product."
                  : "Margin is under 25%. Fine for a loss-leader, thin for a core line."}
              </p>
            ) : null}
          </CardContent>
      </section>
      </Card>

      {canEdit ? <ProductDetailsForm product={product} brackets={brackets} /> : null}
      {canEdit ? <VariantsForm product={product} /> : null}

      {canEdit ? <DeleteProductForm product={product} /> : null}
    </div>
  );
}

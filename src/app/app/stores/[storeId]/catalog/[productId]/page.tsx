import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  approveMockups,
  deleteProduct,
  publishBlockers,
  rejectMockups,
  setProductStatus,
} from "@/app/actions/products";
import { Badge, Breadcrumbs, Callout, PageHeader } from "@/components/ui";
import { getCatalogProduct, getStoreProduct, getSupplier, listTaxBrackets } from "@/lib/data";
import { marginTone } from "@/lib/pricing";
import { requireStoreAccess, roleCan } from "@/lib/session";
import { VIEW_LABELS } from "@/lib/types";
import { formatDateTime, formatMoney, formatPercent } from "@/lib/util";
import { Configurator } from "./Configurator";
import { ProductDetailsForm, VariantsForm } from "./ProductForms";

export default async function ProductEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string; productId: string }>;
  searchParams: Promise<{ imported?: string }>;
}) {
  const { storeId, productId } = await params;
  const { imported } = await searchParams;
  const { store, role } = await requireStoreAccess(storeId);
  const canEdit = roleCan(role, "store.catalog");

  const product = await getStoreProduct(productId);
  if (!product || product.storeId !== storeId) notFound();

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
        eyebrow={supplier ? `Produced by ${supplier.name}` : "Product"}
        title={product.name}
        description={
          <>
            {product.category === "apparel" ? "Apparel" : "Drinkware"} ·{" "}
            {product.variants.filter((v) => v.enabled).length} enabled variants · imported by{" "}
            {product.importedBy}
          </>
        }
        actions={
          <>
            <Badge tone={product.status === "published" ? "green" : product.status === "in_review" ? "amber" : "neutral"}>
              {product.status.replace("_", " ")}
            </Badge>
            {product.status === "published" ? (
              <Link
                href={`/s/${store.slug}/products/${product.slug}`}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary btn-sm"
              >
                View live ↗
              </Link>
            ) : null}
          </>
        }
      />

      {imported ? (
        <Callout tone="green" title="Copied into this store">
          A private copy now sits in {store.name}. Place artwork, generate mockups and check the margin — the
          shared catalog record is untouched.
        </Callout>
      ) : null}

      {/* ------------------------------------------------------ publishing */}
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">Publication</h2>
            <p className="mt-1 text-sm text-muted">
              {blockers.length === 0
                ? "Every pre-flight check passes. This product is ready to sell."
                : `${blockers.length} thing${blockers.length === 1 ? "" : "s"} must be resolved before this product can be published.`}
            </p>
          </div>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              {product.status !== "published" ? (
                <form action={setProductStatus}>
                  <input type="hidden" name="storeId" value={storeId} />
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="status" value="published" />
                  <button type="submit" className="btn-primary" disabled={blockers.length > 0}>
                    Publish to storefront
                  </button>
                </form>
              ) : (
                <form action={setProductStatus}>
                  <input type="hidden" name="storeId" value={storeId} />
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="status" value="in_review" />
                  <button type="submit" className="btn-secondary">
                    Unpublish
                  </button>
                </form>
              )}
              {product.status !== "archived" ? (
                <form action={setProductStatus}>
                  <input type="hidden" name="storeId" value={storeId} />
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="status" value="archived" />
                  <button type="submit" className="btn-ghost">
                    Archive
                  </button>
                </form>
              ) : (
                <form action={setProductStatus}>
                  <input type="hidden" name="storeId" value={storeId} />
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="status" value="draft" />
                  <button type="submit" className="btn-secondary">
                    Restore to draft
                  </button>
                </form>
              )}
            </div>
          ) : null}
        </div>

        {blockers.length > 0 ? (
          <ul className="mt-4 space-y-2.5" role="alert">
            {blockers.map((blocker, index) => (
              <li key={index} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-medium text-amber-900">{blocker.reason}</p>
                <p className="mt-1 text-xs text-amber-800">How to fix: {blocker.fix}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* ---------------------------------------------------- configurator */}
      <section className="card p-5">
        <h2 className="text-base font-semibold text-ink">Artwork and print areas</h2>
        <p className="mt-1 text-sm text-muted">
          Position the design inside the printable rectangle. Every check below reflects the supplier&rsquo;s
          own file and resolution requirements.
        </p>
        <div className="mt-5">
          {catalog ? (
            <Configurator product={product} catalog={catalog} readOnly={!canEdit} />
          ) : (
            <Callout tone="rose" title="Supplier product retired">
              The shared catalog entry behind this product no longer exists, so artwork cannot be pre-flighted.
              Import a replacement from the supplier catalog.
            </Callout>
          )}
        </div>
      </section>

      {/* --------------------------------------------------------- mockups */}
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink">Mockup approval</h2>
            <p className="mt-1 text-sm text-muted">
              {product.mockups.length === 0
                ? "No previews yet. Generate them from the artwork panel above."
                : mockupsApproved
                  ? `Approved by ${product.mockups[0].approvedBy} on ${formatDateTime(product.mockups[0].approvedAt ?? product.mockups[0].generatedAt)}.`
                  : "Review each view. Approval is required before the product can be published."}
            </p>
          </div>
          {canEdit && product.mockups.length > 0 ? (
            <div className="flex gap-2">
              {!mockupsApproved ? (
                <form action={approveMockups}>
                  <input type="hidden" name="storeId" value={storeId} />
                  <input type="hidden" name="productId" value={product.id} />
                  <button type="submit" className="btn-primary btn-sm">
                    Approve {product.mockups.length} preview{product.mockups.length === 1 ? "" : "s"}
                  </button>
                </form>
              ) : null}
              <form action={rejectMockups}>
                <input type="hidden" name="storeId" value={storeId} />
                <input type="hidden" name="productId" value={product.id} />
                <button type="submit" className="btn-ghost btn-sm">
                  Reject and start over
                </button>
              </form>
            </div>
          ) : null}
        </div>

        {product.mockups.length > 0 ? (
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {product.mockups.map((mockup) => (
              <li key={mockup.id} className="overflow-hidden rounded-xl border border-line">
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
                <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
                  <span className="text-sm font-medium text-ink">{VIEW_LABELS[mockup.view]}</span>
                  <Badge tone={mockup.approved ? "green" : "amber"}>
                    {mockup.approved ? "Approved" : "Awaiting approval"}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* ------------------------------------------------------------ costs */}
      <section className="card p-5">
        <h2 className="text-base font-semibold text-ink">Cost, tax and margin</h2>
        <p className="mt-1 text-sm text-muted">
          Everything a decision needs before publishing. Margin is measured against net revenue, because the
          seller remits the tax.
        </p>
        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <dl className="divide-y divide-line text-sm">
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-muted">Supplier cost (cheapest enabled variant)</dt>
              <dd className="font-medium tabular-nums text-ink">{formatMoney(costs.supplierCost, product.currency)}</dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-muted">
                Customisation ({new Set(product.artworks.map((a) => a.printAreaId)).size} print area
                {new Set(product.artworks.map((a) => a.printAreaId)).size === 1 ? "" : "s"})
              </dt>
              <dd className="font-medium tabular-nums text-ink">
                {formatMoney(costs.customizationCost, product.currency)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-muted">Estimated shipping</dt>
              <dd className="font-medium tabular-nums text-ink">
                {formatMoney(costs.shippingEstimate, product.currency)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="font-medium text-ink">Landed cost</dt>
              <dd className="font-semibold tabular-nums text-ink">{formatMoney(landed, product.currency)}</dd>
            </div>
          </dl>

          <dl className="divide-y divide-line text-sm">
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-muted">Tax bracket</dt>
              <dd className="font-medium text-ink">
                {bracket ? `${bracket.name} · ${bracket.rate}%` : "Not selected"}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-muted">
                Tax {store.pricesIncludeTax ? "included in price" : "added at checkout"}
              </dt>
              <dd className="font-medium tabular-nums text-ink">{formatMoney(costs.taxAmount, product.currency)}</dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-muted">Selling price</dt>
              <dd className="font-semibold tabular-nums text-ink">{formatMoney(costs.sellingPrice, product.currency)}</dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="font-medium text-ink">Margin</dt>
              <dd
                className={
                  tone === "healthy"
                    ? "font-semibold tabular-nums text-emerald-700"
                    : tone === "thin"
                      ? "font-semibold tabular-nums text-amber-700"
                      : "font-semibold tabular-nums text-rose-700"
                }
              >
                {formatMoney(costs.marginAmount, product.currency)} · {formatPercent(costs.marginPct)}
              </dd>
            </div>
          </dl>
        </div>
        {tone !== "healthy" ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {tone === "negative"
              ? "This product would sell at a loss. Raise the price or pick a cheaper supplier product."
              : "Margin is under 25%. Fine for a loss-leader, thin for a core line."}
          </p>
        ) : null}
      </section>

      {canEdit ? <ProductDetailsForm product={product} brackets={brackets} /> : null}
      {canEdit ? <VariantsForm product={product} /> : null}

      {canEdit ? (
        <section className="card border-rose-200 p-5">
          <h2 className="text-base font-semibold text-ink">Delete this product</h2>
          <p className="mt-1 text-sm text-muted">
            Removes it from this store only. The shared catalog entry and any other client&rsquo;s copy are
            unaffected. Existing orders keep their own record of what was bought.
          </p>
          <form action={deleteProduct} className="mt-4">
            <input type="hidden" name="storeId" value={storeId} />
            <input type="hidden" name="productId" value={product.id} />
            <button type="submit" className="btn-danger btn-sm">
              Delete permanently
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}

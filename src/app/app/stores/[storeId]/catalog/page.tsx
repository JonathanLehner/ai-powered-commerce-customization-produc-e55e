import Image from "next/image";
import Link from "next/link";
import { setProductStatus } from "@/app/actions/products";
import { Badge, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { listStoreProducts } from "@/lib/data";
import { marginTone } from "@/lib/pricing";
import { requireStoreAccess, roleCan } from "@/lib/session";
import type { StoreProduct } from "@/lib/types";
import { formatMoney, formatPercent, relativeTime } from "@/lib/util";

const STATUS_TONES: Record<StoreProduct["status"], "green" | "amber" | "neutral" | "slate"> = {
  published: "green",
  in_review: "amber",
  draft: "neutral",
  archived: "slate",
};

const STATUS_LABELS: Record<StoreProduct["status"], string> = {
  published: "Published",
  in_review: "In review",
  draft: "Draft",
  archived: "Archived",
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
        : `${p.name} ${p.tags.join(" ")} ${p.description}`.toLowerCase().includes(q.toLowerCase()),
    );

  const published = products.filter((p) => p.status === "published");
  const avgMargin =
    published.length > 0
      ? published.reduce((sum, p) => sum + p.costs.marginPct, 0) / published.length
      : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${store.name} products`}
        description="Price, artwork, tax bracket and publication state are set per store."
        actions={
          canEdit ? (
            <Link href={`/app/stores/${storeId}/sourcing`} className="btn-primary">
              Import from supplier catalog
            </Link>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Products" value={String(products.length)} sub="In this store" />
        <StatCard label="Published" value={String(published.length)} sub="Visible on the storefront" />
        <StatCard
          label="Drafts and reviews"
          value={String(products.filter((p) => p.status !== "published" && p.status !== "archived").length)}
          sub="Not yet live"
        />
        <StatCard
          label="Average margin"
          value={formatPercent(avgMargin)}
          tone={marginTone(avgMargin) === "healthy" ? "green" : marginTone(avgMargin) === "thin" ? "amber" : "rose"}
          sub="Across published products"
        />
      </div>

      <form method="get" className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[12rem] flex-1">
          <label htmlFor="q" className="field-label text-xs">
            Search this catalog
          </label>
          <input id="q" name="q" defaultValue={q ?? ""} placeholder="Name or tag" className="input py-1.5" />
        </div>
        <div>
          <label htmlFor="status" className="field-label text-xs">
            Status
          </label>
          <select id="status" name="status" defaultValue={status ?? ""} className="input py-1.5">
            <option value="">All</option>
            <option value="published">Published</option>
            <option value="in_review">In review</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <button type="submit" className="btn-secondary">
          Filter
        </button>
        {q || status ? (
          <Link href={`/app/stores/${storeId}/catalog`} className="btn-ghost">
            Clear
          </Link>
        ) : null}
      </form>

      {filtered.length === 0 ? (
        <EmptyState
          title={products.length === 0 ? "This catalog is empty" : "Nothing matches that filter"}
          description={
            products.length === 0
              ? "Copy a product from the shared supplier catalog to get started. You will place artwork, review the mockups and set a price before it can be published."
              : "Try a different status or search term."
          }
          action={
            canEdit ? (
              <Link href={`/app/stores/${storeId}/sourcing`} className="btn-primary">
                Browse the supplier catalog
              </Link>
            ) : null
          }
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((product) => {
            const cover = product.mockups[0];
            const tone = marginTone(product.costs.marginPct);
            return (
              <li key={product.id} className="card flex flex-col overflow-hidden">
                <div className="relative border-b border-line bg-canvas">
                  {cover ? (
                    <Image
                      src={cover.url}
                      alt={`${product.name} mockup`}
                      width={640}
                      height={640}
                      loading="lazy"
                      sizes="(min-width: 1280px) 380px, (min-width: 768px) 45vw, 90vw"
                      className="h-auto w-full object-cover"
                      style={{ aspectRatio: "1 / 1" }}
                    />
                  ) : (
                    <div
                      className="flex w-full items-center justify-center text-sm text-muted"
                      style={{ aspectRatio: "1 / 1" }}
                    >
                      No mockup generated yet
                    </div>
                  )}
                  <span className="absolute left-3 top-3">
                    <Badge tone={STATUS_TONES[product.status]}>{STATUS_LABELS[product.status]}</Badge>
                  </span>
                  {product.visibility === "hidden" ? (
                    <span className="absolute right-3 top-3">
                      <Badge tone="slate">Hidden</Badge>
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-1 flex-col p-4">
                  <h3 className="text-sm font-semibold text-ink">
                    <Link href={`/app/stores/${storeId}/catalog/${product.id}`} className="hover:underline">
                      {product.name}
                    </Link>
                  </h3>
                  <p className="mt-1 text-xs text-muted">
                    {product.variants.filter((v) => v.enabled).length} variants · updated{" "}
                    {relativeTime(product.updatedAt)}
                  </p>

                  <dl className="mt-3 grid grid-cols-3 gap-2 border-y border-line py-3 text-xs">
                    <div>
                      <dt className="text-muted">Price</dt>
                      <dd className="font-semibold tabular-nums text-ink">
                        {formatMoney(product.price, product.currency)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Cost</dt>
                      <dd className="font-semibold tabular-nums text-ink">
                        {formatMoney(
                          product.costs.supplierCost + product.costs.customizationCost + product.costs.shippingEstimate,
                          product.currency,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Margin</dt>
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

                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                    <Link href={`/app/stores/${storeId}/catalog/${product.id}`} className="btn-secondary btn-sm">
                      {canEdit ? "Edit product" : "View product"}
                    </Link>
                    {canEdit && product.status === "published" ? (
                      <form action={setProductStatus}>
                        <input type="hidden" name="storeId" value={storeId} />
                        <input type="hidden" name="productId" value={product.id} />
                        <input type="hidden" name="status" value="in_review" />
                        <button type="submit" className="btn-ghost btn-sm">
                          Unpublish
                        </button>
                      </form>
                    ) : null}
                    {product.status === "published" ? (
                      <Link
                        href={`/s/${store.slug}/products/${product.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-ghost btn-sm"
                      >
                        View live ↗
                      </Link>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

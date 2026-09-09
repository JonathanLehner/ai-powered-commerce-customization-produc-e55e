import Image from "next/image";
import Link from "next/link";
import { importCatalogProduct } from "@/app/actions/products";
import { withdrawQuoteRequest } from "@/app/actions/sourcing";
import { ConfirmSubmit, SubmitButton } from "@/components/forms";
import { Badge, Callout, EmptyState, PageHeader } from "@/components/ui";
import { listCatalogProducts, listQuoteRequests, listStoreProducts, listSuppliers } from "@/lib/data";
import { requireStoreAccess } from "@/lib/session";
import { storeSku } from "@/lib/sku";
import {
  formatQuantity,
  indicativeRange,
  isQuoteOnly,
  QUOTE_PRICE_LABEL,
  QUOTE_STATUS_LABELS,
  QUOTE_STATUS_NOTES,
  QUOTE_STATUS_TONES,
  quoteIsUsable,
} from "@/lib/sourcing";
import type { CatalogProduct, QuoteRequest, StoreProduct } from "@/lib/types";
import { formatDate, formatMoney, newId } from "@/lib/util";
import { QuoteRequestForm } from "./QuoteRequestForm";

/** The fields every copy form posts, including the key that makes a retry safe. */
function CopyFields({
  storeId,
  catalogId,
  filters,
  confirmed = false,
}: {
  storeId: string;
  catalogId: string;
  filters: string;
  confirmed?: boolean;
}) {
  return (
    <>
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="catalogId" value={catalogId} />
      <input type="hidden" name="filters" value={filters} />
      <input type="hidden" name="importKey" value={newId("imp")} />
      {confirmed ? <input type="hidden" name="confirmed" value="1" /> : null}
    </>
  );
}

/**
 * Shown once a store already holds a copy of the supplier product. Opening the
 * copy that exists is the first thing offered, because it is usually what was
 * wanted — a second copy is an independent product with its own artwork, price
 * and SKU, and nothing merges the two back together later.
 */
function ConfirmCopyAgain({
  storeId,
  catalogId,
  copies,
  channelCode,
  filters,
  cancelHref,
}: {
  storeId: string;
  catalogId: string;
  copies: StoreProduct[];
  channelCode: string;
  filters: string;
  cancelHref: string;
}) {
  return (
    <div className="w-full rounded-lg border border-amber-200 bg-amber-50 p-3" role="group">
      <p className="text-sm font-semibold text-amber-900">
        Copy this in again? It is already in this store.
      </p>
      <ul className="mt-2 space-y-1.5">
        {copies.map((copy) => (
          <li key={copy.id} className="text-xs text-amber-900">
            <Link
              href={`/app/stores/${storeId}/catalog/${copy.id}`}
              className="font-medium underline underline-offset-2"
            >
              Open {copy.name}
            </Link>{" "}
            · <span className="font-mono">{storeSku(copy, channelCode)}</span> · imported{" "}
            {formatDate(copy.importedAt)}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-amber-800">
        A second copy is a separate product with its own artwork, price and SKU. It is named for you so the
        two never look alike, and you can rename it straight away.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <form action={importCatalogProduct}>
          <CopyFields storeId={storeId} catalogId={catalogId} filters={filters} confirmed />
          <SubmitButton className="btn-primary btn-sm" pendingLabel="Copying…">
            Copy again anyway
          </SubmitButton>
        </form>
        <Link href={cancelHref} className="btn-ghost btn-sm" scroll={false}>
          Cancel
        </Link>
      </div>
    </div>
  );
}

/**
 * One request for quote in the store's own queue: what was asked for, where it
 * has got to, and what came back. A quote that is still live is also the only
 * way the listing behind it can be copied in, because the quoted cost is the
 * only unit price a bulk-sourcing listing has ever had.
 */
function QuoteRequestRow({
  request,
  storeId,
  filters,
}: {
  request: QuoteRequest;
  storeId: string;
  filters: string;
}) {
  const usable = quoteIsUsable(request);
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted">{request.code}</span>
            <h3 className="text-sm font-semibold text-ink">{request.productName}</h3>
            <Badge tone={QUOTE_STATUS_TONES[request.status]}>{QUOTE_STATUS_LABELS[request.status]}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted">
            {request.supplierName} · {formatQuantity(request.quantity)} to {request.destination} · asked by{" "}
            {request.requestedBy} on {formatDate(request.createdAt)}
            {request.neededBy ? ` · needed by ${formatDate(request.neededBy)}` : ""}
          </p>
          <p className="mt-2 text-sm text-inksoft">{QUOTE_STATUS_NOTES[request.status]}</p>
          {request.status === "quoted" && request.response ? (
            <p className="mt-1 text-sm text-ink">
              <span className="font-semibold tabular-nums">
                {formatMoney(request.response.unitCost, request.currency)}
              </span>{" "}
              a unit · {request.response.leadTimeDays} days production
              {request.response.validUntil ? ` · valid until ${formatDate(request.response.validUntil)}` : ""}
              {usable ? "" : " · expired"}
            </p>
          ) : null}
          {request.response?.notes ? (
            <p className="mt-1 text-xs text-muted">{request.response.notes}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {usable ? (
            <form action={importCatalogProduct}>
              <CopyFields storeId={storeId} catalogId={request.catalogProductId} filters={filters} />
              <SubmitButton className="btn-primary btn-sm" pendingLabel="Copying…">
                Copy in at the quoted price
              </SubmitButton>
            </form>
          ) : null}
          {request.status === "submitted" ? (
            <form action={withdrawQuoteRequest}>
              <input type="hidden" name="storeId" value={storeId} />
              <input type="hidden" name="requestId" value={request.id} />
              <ConfirmSubmit
                className="btn-secondary btn-sm"
                confirmLabel="Withdraw"
                question="Withdraw this request?"
              >
                Withdraw
              </ConfirmSubmit>
            </form>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function matches(product: CatalogProduct, query: string) {
  if (!query) return true;
  const haystack = `${product.name} ${product.productType} ${product.description} ${product.category}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((term) => haystack.includes(term));
}

export default async function SourcingPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{
    q?: string;
    category?: string;
    supplier?: string;
    region?: string;
    compare?: string;
    confirm?: string;
    rfq?: string;
  }>;
}) {
  const { storeId } = await params;
  const filters = await searchParams;
  const { store, user } = await requireStoreAccess(storeId, "store.catalog");

  const [catalog, suppliers, storeProducts, quoteRequests] = await Promise.all([
    listCatalogProducts(),
    listSuppliers(),
    listStoreProducts(storeId),
    listQuoteRequests(storeId),
  ]);

  const approved = suppliers.filter((s) => s.status === "approved");
  const approvedIds = new Set(approved.map((s) => s.id));
  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? "Unknown supplier";

  const regions = [...new Set(catalog.flatMap((c) => c.fulfillmentRegions))].sort();

  const visible = catalog
    .filter((c) => c.status === "active" && approvedIds.has(c.supplierId))
    .filter((c) => matches(c, filters.q ?? ""))
    .filter((c) => !filters.category || c.category === filters.category)
    .filter((c) => !filters.supplier || c.supplierId === filters.supplier)
    .filter((c) => !filters.region || c.fulfillmentRegions.includes(filters.region));

  const compareIds = (filters.compare ?? "").split(",").filter(Boolean);
  const comparing = compareIds
    .map((id) => catalog.find((c) => c.id === id))
    .filter((c): c is CatalogProduct => Boolean(c));

  // Every copy a store already holds of a supplier product, newest first, so a
  // repeat copy can offer to open one of them instead.
  const copiesOf = (catalogId: string) =>
    storeProducts
      .filter((p) => p.catalogProductId === catalogId)
      .sort((a, b) => a.importedAt.localeCompare(b.importedAt));

  // What this store has already asked about a listing, newest first, so a
  // card can say "awaiting quote" instead of offering the same request again.
  const requestsFor = (catalogId: string) => quoteRequests.filter((r) => r.catalogProductId === catalogId);
  const liveQuote = (catalogId: string) => requestsFor(catalogId).find((r) => quoteIsUsable(r));
  const openRequest = (catalogId: string) => requestsFor(catalogId).find((r) => r.status === "submitted");

  // The listing whose request form is open, if the address names one that is
  // still quote-priced and still in the catalog.
  const askingAbout = filters.rfq ? catalog.find((c) => c.id === filters.rfq) : undefined;
  const asking = askingAbout && isQuoteOnly(askingAbout) ? askingAbout : undefined;

  const filterQuery = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value && key !== "confirm" && key !== "rfq") filterQuery.set(key, value);
  }
  const filterString = filterQuery.toString();

  const buildHref = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { ...filters, ...patch };
    for (const [key, value] of Object.entries(merged)) {
      if (value) next.set(key, value);
    }
    const qs = next.toString();
    return `/app/stores/${storeId}/sourcing${qs ? `?${qs}` : ""}`;
  };

  const toggleCompare = (id: string) => {
    const set = new Set(compareIds);
    if (set.has(id)) set.delete(id);
    else if (set.size < 3) set.add(id);
    const value = [...set].join(",");
    return buildHref({ compare: value || undefined });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shared supplier catalog"
        description="Curated by the platform team. Copying one in creates an independent store product."
      />

      <form method="get" className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[12rem] flex-1">
          <label htmlFor="q" className="field-label text-xs">
            Search
          </label>
          <input
            id="q"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="Tee, hoodie, mug…"
            className="input py-1.5"
          />
        </div>
        <div>
          <label htmlFor="category" className="field-label text-xs">
            Category
          </label>
          <select id="category" name="category" defaultValue={filters.category ?? ""} className="input py-1.5">
            <option value="">All</option>
            <option value="apparel">Apparel</option>
            <option value="drinkware">Drinkware</option>
          </select>
        </div>
        <div>
          <label htmlFor="supplier" className="field-label text-xs">
            Supplier
          </label>
          <select id="supplier" name="supplier" defaultValue={filters.supplier ?? ""} className="input py-1.5">
            <option value="">All approved</option>
            {approved.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="region" className="field-label text-xs">
            Fulfils to
          </label>
          <select id="region" name="region" defaultValue={filters.region ?? ""} className="input py-1.5">
            <option value="">Anywhere</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        {filters.compare ? <input type="hidden" name="compare" value={filters.compare} /> : null}
        <button type="submit" className="btn-secondary">
          Apply filters
        </button>
        {filters.q || filters.category || filters.supplier || filters.region ? (
          <Link href={buildHref({ q: undefined, category: undefined, supplier: undefined, region: undefined })} className="btn-ghost">
            Clear
          </Link>
        ) : null}
      </form>

      {asking ? (
        <section id="rfq" className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-ink">Request a quote — {asking.name}</h2>
              <p className="mt-1 max-w-2xl text-sm text-inksoft">
                {supplierName(asking.supplierId)} prices bulk runs per enquiry, so there is no unit cost to
                copy. Comparable runs have come in at {indicativeRange(asking)}, and suppliers answer in{" "}
                {asking.bulkSourcing.responseDays[0]}–{asking.bulkSourcing.responseDays[1]} working days.
              </p>
              <p className="mt-1 max-w-2xl text-xs text-muted">{asking.bulkSourcing.quoteNotes}</p>
            </div>
            <Link href={buildHref({ rfq: undefined })} className="btn-ghost btn-sm" scroll={false}>
              Close
            </Link>
          </div>
          <div className="mt-4">
            <QuoteRequestForm
              storeId={storeId}
              catalogId={asking.id}
              regions={asking.fulfillmentRegions}
              minimumOrderQuantity={asking.bulkSourcing.minimumOrderQuantity}
              currency={asking.currency}
              defaultDestination={
                filters.region && asking.fulfillmentRegions.includes(filters.region)
                  ? filters.region
                  : asking.fulfillmentRegions[0]
              }
              contactName={user.name}
              contactEmail={user.email}
            />
          </div>
        </section>
      ) : null}

      {comparing.length > 0 ? (
        <section className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-ink">
              Comparing {comparing.length} product{comparing.length === 1 ? "" : "s"}
            </h2>
            <Link href={buildHref({ compare: undefined })} className="btn-ghost btn-sm">
              Clear comparison
            </Link>
          </div>
          <div className="mt-4 relative overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="py-2 pr-3">Attribute</th>
                  {comparing.map((c) => (
                    <th key={c.id} scope="col" className="py-2 pr-3 text-ink">
                      {c.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {[
                  { label: "Supplier", value: (c: CatalogProduct) => supplierName(c.supplierId) },
                  {
                    label: "Unit cost",
                    // A bulk-sourcing listing has no unit cost to compare, so
                    // the column says what it is instead of showing a zero.
                    value: (c: CatalogProduct) =>
                      isQuoteOnly(c) ? `${QUOTE_PRICE_LABEL} · ${indicativeRange(c)}` : formatMoney(c.baseCost, c.currency),
                  },
                  {
                    label: "Minimum order",
                    value: (c: CatalogProduct) =>
                      isQuoteOnly(c) ? formatQuantity(c.bulkSourcing.minimumOrderQuantity) : "1 unit",
                  },
                  {
                    label: "Customisation per area",
                    value: (c: CatalogProduct) =>
                      isQuoteOnly(c) ? "Quoted with the run" : formatMoney(c.customizationCostPerArea, c.currency),
                  },
                  {
                    label: "Shipping estimate",
                    value: (c: CatalogProduct) =>
                      isQuoteOnly(c) ? "Freight quoted with the run" : formatMoney(c.shippingEstimate, c.currency),
                  },
                  {
                    label: "Ordering",
                    value: (c: CatalogProduct) =>
                      isQuoteOnly(c) ? "Manual purchase order" : "Routed to the supplier automatically",
                  },
                  { label: "Lead time", value: (c: CatalogProduct) => `${c.leadTimeDays[0]}–${c.leadTimeDays[1]} days` },
                  { label: "Variants", value: (c: CatalogProduct) => `${c.variants.length}` },
                  {
                    label: "Print areas",
                    value: (c: CatalogProduct) =>
                      c.printAreas.map((a) => `${a.name} (${a.widthMm}×${a.heightMm} mm)`).join(", "),
                  },
                  { label: "Minimum DPI", value: (c: CatalogProduct) => `${c.fileRequirements.minDpi}` },
                  { label: "Fulfils to", value: (c: CatalogProduct) => c.fulfillmentRegions.join(", ") },
                  { label: "Availability", value: (c: CatalogProduct) => c.availability },
                ].map((row) => (
                  <tr key={row.label}>
                    <th scope="row" className="py-2.5 pr-3 font-medium text-muted">
                      {row.label}
                    </th>
                    {comparing.map((c) => (
                      <td key={c.id} className="py-2.5 pr-3 text-inksoft">
                        {row.value(c)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <th scope="row" className="py-2.5 pr-3 font-medium text-muted">
                    Import
                  </th>
                  {comparing.map((c) => {
                    const copies = copiesOf(c.id);
                    const quoted = isQuoteOnly(c) ? liveQuote(c.id) : undefined;
                    return (
                      <td key={c.id} className="py-2.5 pr-3">
                        {isQuoteOnly(c) && !quoted ? (
                          <Link
                            href={buildHref({ rfq: c.id, confirm: undefined })}
                            className="btn-primary btn-sm"
                            scroll={false}
                          >
                            Request a quote
                          </Link>
                        ) : copies.length === 0 ? (
                          <form action={importCatalogProduct}>
                            <CopyFields storeId={storeId} catalogId={c.id} filters={filterString} />
                            <SubmitButton className="btn-primary btn-sm" pendingLabel="Copying…">
                              Copy to store
                            </SubmitButton>
                          </form>
                        ) : filters.confirm === c.id ? (
                          <ConfirmCopyAgain
                            storeId={storeId}
                            catalogId={c.id}
                            copies={copies}
                            channelCode={store.channelCode}
                            filters={filterString}
                            cancelHref={buildHref({ confirm: undefined })}
                          />
                        ) : (
                          <Link
                            href={buildHref({ confirm: c.id })}
                            className="btn-primary btn-sm"
                            scroll={false}
                          >
                            Copy again
                          </Link>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          title="Nothing matches those filters"
          description="Try a different category, supplier or fulfilment region. The platform team curates which suppliers are available to stores."
          action={
            <Link href={buildHref({ q: undefined, category: undefined, supplier: undefined, region: undefined })} className="btn-secondary">
              Clear filters
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((product) => {
            const cover = product.mockups[0];
            const copies = copiesOf(product.id);
            const selected = compareIds.includes(product.id);
            const quoteOnly = isQuoteOnly(product);
            const quoted = quoteOnly ? liveQuote(product.id) : undefined;
            const awaiting = quoteOnly ? openRequest(product.id) : undefined;
            return (
              <li key={product.id} className="card flex flex-col overflow-hidden">
                {cover ? (
                  <div className="border-b border-line bg-canvas">
                    <Image
                      src={cover.url}
                      alt={`${product.name} in ${cover.colour}`}
                      width={640}
                      height={640}
                      loading="lazy"
                      sizes="(min-width: 1280px) 380px, (min-width: 768px) 45vw, 90vw"
                      className="h-auto w-full object-cover"
                      style={{ aspectRatio: "1 / 1" }}
                    />
                  </div>
                ) : null}
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-ink">{product.name}</h3>
                    <Badge tone={quoteOnly ? "iris" : product.availability === "available" ? "green" : "amber"}>
                      {quoteOnly ? "Bulk sourcing" : product.availability}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {supplierName(product.supplierId)} · {product.productType}
                  </p>
                  <p className="mt-2 line-clamp-3 text-sm text-inksoft">{product.description}</p>

                  <dl className="mt-3 grid grid-cols-2 gap-2 border-y border-line py-3 text-xs">
                    <div>
                      <dt className="text-muted">Unit cost</dt>
                      <dd className="font-semibold tabular-nums text-ink">
                        {quoteOnly ? QUOTE_PRICE_LABEL : formatMoney(product.baseCost, product.currency)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">{quoteOnly ? "Minimum order" : "Print areas"}</dt>
                      <dd className="font-semibold text-ink">
                        {isQuoteOnly(product)
                          ? formatQuantity(product.bulkSourcing.minimumOrderQuantity)
                          : product.printAreas.length}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Lead time</dt>
                      <dd className="font-semibold text-ink">
                        {product.leadTimeDays[0]}–{product.leadTimeDays[1]} days
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Variants</dt>
                      <dd className="font-semibold text-ink">{product.variants.length}</dd>
                    </div>
                  </dl>

                  <p className="mt-3 text-xs text-muted">
                    Fulfils to {product.fulfillmentRegions.slice(0, 3).join(", ")}
                    {product.fulfillmentRegions.length > 3 ? ` +${product.fulfillmentRegions.length - 3}` : ""}
                  </p>
                  {isQuoteOnly(product) ? (
                    <p className="mt-1 text-xs text-muted">
                      Recent runs {indicativeRange(product)} · quoted per enquiry, ordered by manual purchase
                      order
                    </p>
                  ) : null}

                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                    {quoteOnly && !quoted ? (
                      <>
                        <Link
                          href={buildHref({ rfq: product.id, confirm: undefined })}
                          className="btn-primary btn-sm"
                          scroll={false}
                        >
                          {awaiting ? "Ask about another run" : "Request a quote"}
                        </Link>
                        <Link href={toggleCompare(product.id)} className="btn-secondary btn-sm" scroll={false}>
                          {selected ? "Remove from compare" : "Compare"}
                        </Link>
                        {awaiting ? (
                          <Badge tone={QUOTE_STATUS_TONES.submitted}>
                            {QUOTE_STATUS_LABELS.submitted} · {awaiting.code}
                          </Badge>
                        ) : null}
                      </>
                    ) : filters.confirm === product.id && copies.length > 0 ? (
                      <ConfirmCopyAgain
                        storeId={storeId}
                        catalogId={product.id}
                        copies={copies}
                        channelCode={store.channelCode}
                        filters={filterString}
                        cancelHref={buildHref({ confirm: undefined })}
                      />
                    ) : (
                      <>
                        {copies.length > 0 ? (
                          <Link
                            href={buildHref({ confirm: product.id })}
                            className="btn-primary btn-sm"
                            scroll={false}
                          >
                            Copy again
                          </Link>
                        ) : (
                          <form action={importCatalogProduct}>
                            <CopyFields storeId={storeId} catalogId={product.id} filters={filterString} />
                            <SubmitButton className="btn-primary btn-sm" pendingLabel="Copying…">
                              {quoted ? "Copy in at the quoted price" : "Copy to store"}
                            </SubmitButton>
                          </form>
                        )}
                        <Link href={toggleCompare(product.id)} className="btn-secondary btn-sm" scroll={false}>
                          {selected ? "Remove from compare" : "Compare"}
                        </Link>
                        {copies.length > 0 ? (
                          <Badge tone="neutral">
                            Already in this store
                            {copies.length > 1 ? ` · ${copies.length} copies` : ""}
                          </Badge>
                        ) : null}
                        {quoted?.response ? (
                          <Badge tone={QUOTE_STATUS_TONES.quoted}>
                            Quoted {formatMoney(quoted.response.unitCost, quoted.currency)} a unit · {quoted.code}
                          </Badge>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {quoteRequests.length > 0 ? (
        <section className="card p-5">
          <h2 className="text-base font-semibold text-ink">Quote requests</h2>
          <p className="mt-1 max-w-3xl text-sm text-inksoft">
            Bulk enquiries this store has raised, newest first. A quote that comes back prices the listing;
            any order made from it is flagged for manual handling, because the marketplace takes purchase
            orders rather than API jobs.
          </p>
          <ul className="mt-4 divide-y divide-line">
            {quoteRequests.map((request) => (
              <QuoteRequestRow
                key={request.id}
                request={request}
                storeId={storeId}
                filters={filterString}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <Callout tone="neutral" title="Bulk sourcing">
        Alibaba.com listings are quoted per enquiry rather than priced per unit: ask for a run, and the quote
        that comes back is what the listing is copied in at. Orders placed that way are flagged for manual
        handling rather than submitted automatically.
      </Callout>
    </div>
  );
}

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { importCatalogProduct } from "@/app/actions/products";
import { SubmitButton } from "@/components/forms";
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
  QUOTE_STATUS_TONES,
  quoteIsLive,
} from "@/lib/sourcing";
import type { CatalogProduct, QuoteRequest, StoreProduct, SupplierQuote } from "@/lib/types";
import { formatDate, formatMoney, newId } from "@/lib/util";
import { AcceptedQuoteAction, AcceptQuoteButton, Enquiries } from "./Enquiries";
import { QuoteRequestForm } from "./QuoteRequestForm";

/** Up to this many listings and quotes sit side by side. */
const COMPARE_LIMIT = 4;

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

/** One column of the side-by-side comparison: a catalog listing or a supplier quote. */
interface CompareColumn {
  key: string;
  name: ReactNode;
  supplier: string;
  unitCost: string;
  minimumOrder: string;
  customisation: string;
  shipping: string;
  ordering: string;
  leadTime: string;
  variants: string;
  printAreas: string;
  minDpi: string;
  fulfils: string;
  availability: string;
  action: ReactNode;
}

const COMPARE_ROWS: { label: string; value: (c: CompareColumn) => ReactNode }[] = [
  { label: "Supplier", value: (c) => c.supplier },
  { label: "Unit cost", value: (c) => c.unitCost },
  { label: "Minimum order", value: (c) => c.minimumOrder },
  { label: "Customisation per area", value: (c) => c.customisation },
  { label: "Shipping estimate", value: (c) => c.shipping },
  { label: "Ordering", value: (c) => c.ordering },
  { label: "Lead time", value: (c) => c.leadTime },
  { label: "Variants", value: (c) => c.variants },
  { label: "Print areas", value: (c) => c.printAreas },
  { label: "Minimum DPI", value: (c) => c.minDpi },
  { label: "Fulfils to", value: (c) => c.fulfils },
  { label: "Availability", value: (c) => c.availability },
];

function listingTerms(c: CatalogProduct | undefined) {
  return {
    variants: c ? `${c.variants.length}` : "—",
    printAreas: c ? c.printAreas.map((a) => `${a.name} (${a.widthMm}×${a.heightMm} mm)`).join(", ") : "—",
    minDpi: c ? `${c.fileRequirements.minDpi}` : "—",
  };
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
    ref?: string;
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
  const catalogName = (id: string) => catalog.find((c) => c.id === id)?.name ?? "a retired listing";
  // The marketplace that takes enquiries for anything not already listed with it.
  const marketplace = approved.find((s) => s.kind === "sourcing_marketplace" && s.capabilities.quotes);

  const regions = [...new Set(catalog.flatMap((c) => c.fulfillmentRegions))].sort();
  const offered = catalog.filter((c) => c.status === "active" && approvedIds.has(c.supplierId));

  const visible = offered
    .filter((c) => matches(c, filters.q ?? ""))
    .filter((c) => !filters.category || c.category === filters.category)
    .filter((c) => !filters.supplier || c.supplierId === filters.supplier)
    .filter((c) => !filters.region || c.fulfillmentRegions.includes(filters.region));

  // Every quote the store has had back, by id, with the enquiry it answers.
  const quotesById = new Map<string, { request: QuoteRequest; quote: SupplierQuote }>();
  for (const request of quoteRequests) {
    for (const quote of request.quotes ?? []) quotesById.set(quote.id, { request, quote });
  }

  const compareIds = (filters.compare ?? "").split(",").filter(Boolean);

  // Every copy a store already holds of a supplier product, newest first, so a
  // repeat copy can offer to open one of them instead.
  const copiesOf = (catalogId: string) =>
    storeProducts
      .filter((p) => p.catalogProductId === catalogId && !p.manualFulfilment)
      .sort((a, b) => a.importedAt.localeCompare(b.importedAt));

  // What this store has already asked about a listing, so a card can say
  // "awaiting quotes" or "3 quotes" instead of offering the same request again.
  const requestsFor = (catalogId: string) => quoteRequests.filter((r) => r.catalogProductId === catalogId);
  const openRequest = (catalogId: string) =>
    requestsFor(catalogId).find((r) => r.status === "submitted" || r.status === "quoted");

  // The enquiry form: about one quote-priced listing, or a general one that
  // refers to any catalog item or describes the product from scratch.
  const askingAbout = filters.rfq && filters.rfq !== "new" ? offered.find((c) => c.id === filters.rfq) : undefined;
  const asking = askingAbout && isQuoteOnly(askingAbout) ? askingAbout : undefined;
  const askingGeneral = filters.rfq === "new" && marketplace ? marketplace : undefined;

  const filterQuery = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value && key !== "confirm" && key !== "rfq" && key !== "ref") filterQuery.set(key, value);
  }
  const filterString = filterQuery.toString();

  const buildHref = (patch: Record<string, string | undefined>, hash = "") => {
    const next = new URLSearchParams();
    const merged = { ...filters, ...patch };
    for (const [key, value] of Object.entries(merged)) {
      if (value) next.set(key, value);
    }
    const qs = next.toString();
    return `/app/stores/${storeId}/sourcing${qs ? `?${qs}` : ""}${hash}`;
  };
  const startEnquiryHref = (ref?: string) => buildHref({ rfq: "new", ref, confirm: undefined }, "#rfq");

  const toggleCompare = (id: string) => {
    const set = new Set(compareIds);
    if (set.has(id)) set.delete(id);
    else if (set.size < COMPARE_LIMIT) set.add(id);
    const value = [...set].join(",");
    return buildHref({ compare: value || undefined });
  };

  const catalogAction = (c: CatalogProduct): ReactNode => {
    const copies = copiesOf(c.id);
    if (isQuoteOnly(c)) {
      return (
        <Link href={buildHref({ rfq: c.id, confirm: undefined }, "#rfq")} className="btn-primary btn-sm" scroll={false}>
          Request a quote
        </Link>
      );
    }
    if (copies.length === 0) {
      return (
        <form action={importCatalogProduct}>
          <CopyFields storeId={storeId} catalogId={c.id} filters={filterString} />
          <SubmitButton className="btn-primary btn-sm" pendingLabel="Copying…">
            Copy to store
          </SubmitButton>
        </form>
      );
    }
    if (filters.confirm === c.id) {
      return (
        <ConfirmCopyAgain
          storeId={storeId}
          catalogId={c.id}
          copies={copies}
          channelCode={store.channelCode}
          filters={filterString}
          cancelHref={buildHref({ confirm: undefined })}
        />
      );
    }
    return (
      <Link href={buildHref({ confirm: c.id })} className="btn-primary btn-sm" scroll={false}>
        Copy again
      </Link>
    );
  };

  const catalogColumn = (c: CatalogProduct): CompareColumn => {
    const quoteOnly = isQuoteOnly(c);
    return {
      key: c.id,
      name: c.name,
      supplier: supplierName(c.supplierId),
      // A bulk-sourcing listing has no unit cost to compare, so the column
      // says what it is instead of showing a zero.
      unitCost: quoteOnly ? `${QUOTE_PRICE_LABEL} · ${indicativeRange(c)}` : formatMoney(c.baseCost, c.currency),
      minimumOrder: quoteOnly ? formatQuantity(c.bulkSourcing.minimumOrderQuantity) : "1 unit",
      customisation: quoteOnly ? "Quoted with the run" : formatMoney(c.customizationCostPerArea, c.currency),
      shipping: quoteOnly ? "Freight quoted with the run" : formatMoney(c.shippingEstimate, c.currency),
      ordering: quoteOnly ? "Manual purchase order" : "Routed to the supplier automatically",
      leadTime: `${c.leadTimeDays[0]}–${c.leadTimeDays[1]} days`,
      ...listingTerms(c),
      fulfils: c.fulfillmentRegions.join(", "),
      availability: c.availability,
      action: catalogAction(c),
    };
  };

  const quoteColumn = ({ request, quote }: { request: QuoteRequest; quote: SupplierQuote }): CompareColumn => {
    const live = quoteIsLive(quote);
    return {
      key: quote.id,
      name: (
        <>
          {request.productName}
          <span className="block text-xs font-normal text-muted">
            Quote on {request.code} · {quote.supplierLabel}
          </span>
        </>
      ),
      supplier: `${quote.supplierLabel} via ${request.supplierName}`,
      unitCost: `${formatMoney(quote.unitCost, request.currency)} quoted${
        request.targetUnitCost === null ? "" : ` · target ${formatMoney(request.targetUnitCost, request.currency)}`
      }`,
      minimumOrder: formatQuantity(quote.minimumOrderQuantity),
      customisation: "Included in the quote",
      shipping: "Freight quoted with the run",
      ordering: "Manual purchase order",
      leadTime: `${quote.leadTimeDays} days production`,
      ...listingTerms(catalog.find((c) => c.id === quote.baseCatalogProductId)),
      fulfils: request.destination,
      availability: quote.validUntil
        ? `${live ? "Quote valid until" : "Quote expired"} ${formatDate(quote.validUntil)}`
        : "No expiry given",
      action:
        request.status === "accepted" && request.acceptedQuoteId === quote.id ? (
          <AcceptedQuoteAction storeId={storeId} request={request} />
        ) : request.status === "quoted" ? (
          <AcceptQuoteButton storeId={storeId} request={request} quote={quote} />
        ) : (
          <Badge tone={QUOTE_STATUS_TONES[request.status]}>{QUOTE_STATUS_LABELS[request.status]}</Badge>
        ),
    };
  };

  const columns = compareIds
    .map((id) => {
      const listing = catalog.find((c) => c.id === id);
      if (listing) return catalogColumn(listing);
      const quoted = quotesById.get(id);
      return quoted ? quoteColumn(quoted) : null;
    })
    .filter((c): c is CompareColumn => c !== null);

  const supplierFilter = filters.supplier ? suppliers.find((s) => s.id === filters.supplier) : undefined;
  const bulkHint =
    supplierFilter?.kind === "sourcing_marketplace"
      ? `${supplierFilter.name} prices bulk runs per enquiry. Start an enquiry for the product you need — describe it or refer to any catalog item — and the quotes that come back appear here beside the print-on-demand options.`
      : "Try a different category, supplier or fulfilment region. The platform team curates which suppliers are available to stores.";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shared supplier catalog"
        description="Curated by the platform team. Copying one in creates an independent store product."
        actions={
          marketplace ? (
            <Link href={startEnquiryHref()} className="btn-secondary" scroll={false}>
              Start a bulk enquiry
            </Link>
          ) : null
        }
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

      {asking || askingGeneral ? (
        <section id="rfq" className="card scroll-mt-6 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              {asking ? (
                <>
                  <h2 className="text-base font-semibold text-ink">Request a quote — {asking.name}</h2>
                  <p className="mt-1 max-w-2xl text-sm text-inksoft">
                    {supplierName(asking.supplierId)} prices bulk runs per enquiry, so there is no unit cost to
                    copy. Comparable runs have come in at {indicativeRange(asking)}, and suppliers answer in{" "}
                    {asking.bulkSourcing.responseDays[0]}–{asking.bulkSourcing.responseDays[1]} working days.
                  </p>
                  <p className="mt-1 max-w-2xl text-xs text-muted">{asking.bulkSourcing.quoteNotes}</p>
                </>
              ) : (
                <>
                  <h2 className="text-base font-semibold text-ink">Start a bulk sourcing enquiry</h2>
                  <p className="mt-1 max-w-2xl text-sm text-inksoft">
                    Refer to any catalog item to have it made in bulk, or describe the product yourself.{" "}
                    {marketplace?.name} suppliers quote on it, and every quote appears under Bulk sourcing
                    enquiries and in the side-by-side comparison.
                  </p>
                </>
              )}
            </div>
            <Link href={buildHref({ rfq: undefined, ref: undefined })} className="btn-ghost btn-sm" scroll={false}>
              Close
            </Link>
          </div>
          <div className="mt-4">
            {asking ? (
              <QuoteRequestForm
                storeId={storeId}
                listing={{ id: asking.id }}
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
            ) : askingGeneral ? (
              <QuoteRequestForm
                storeId={storeId}
                catalogOptions={offered.map((c) => ({
                  id: c.id,
                  label: `${c.name} · ${supplierName(c.supplierId)}`,
                }))}
                defaultReference={filters.ref && offered.some((c) => c.id === filters.ref) ? filters.ref : ""}
                regions={askingGeneral.regions}
                minimumOrderQuantity={0}
                currency="USD"
                defaultDestination={
                  filters.region && askingGeneral.regions.includes(filters.region)
                    ? filters.region
                    : askingGeneral.regions[0]
                }
                contactName={user.name}
                contactEmail={user.email}
              />
            ) : null}
          </div>
        </section>
      ) : null}

      {columns.length > 0 ? (
        <section className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-ink">
              Comparing {columns.length} option{columns.length === 1 ? "" : "s"}
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
                  {columns.map((c) => (
                    <th key={c.key} scope="col" className="py-2 pr-3 normal-case tracking-normal text-sm text-ink">
                      {c.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {COMPARE_ROWS.map((row) => (
                  <tr key={row.label}>
                    <th scope="row" className="py-2.5 pr-3 font-medium text-muted">
                      {row.label}
                    </th>
                    {columns.map((c) => (
                      <td key={c.key} className="py-2.5 pr-3 text-inksoft">
                        {row.value(c)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <th scope="row" className="py-2.5 pr-3 font-medium text-muted">
                    Next step
                  </th>
                  {columns.map((c) => (
                    <td key={c.key} className="py-2.5 pr-3">
                      {c.action}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {quoteRequests.length > 0 ? (
        <Enquiries
          storeId={storeId}
          requests={quoteRequests}
          catalogName={catalogName}
          compareHref={toggleCompare}
          compareIds={compareIds}
          startHref={startEnquiryHref()}
        />
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          title="Nothing matches those filters"
          description={bulkHint}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {supplierFilter?.kind === "sourcing_marketplace" && marketplace ? (
                <Link href={startEnquiryHref()} className="btn-primary" scroll={false}>
                  Start a bulk enquiry
                </Link>
              ) : null}
              <Link
                href={buildHref({ q: undefined, category: undefined, supplier: undefined, region: undefined })}
                className="btn-secondary"
              >
                Clear filters
              </Link>
            </div>
          }
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((product) => {
            const cover = product.mockups[0];
            const copies = copiesOf(product.id);
            const selected = compareIds.includes(product.id);
            const quoteOnly = isQuoteOnly(product);
            const awaiting = quoteOnly ? openRequest(product.id) : undefined;
            const quoteCount = awaiting ? (awaiting.quotes ?? []).length : 0;
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
                    {quoteOnly ? (
                      <>
                        <Link
                          href={buildHref({ rfq: product.id, confirm: undefined }, "#rfq")}
                          className="btn-primary btn-sm"
                          scroll={false}
                        >
                          {awaiting ? "Ask about another run" : "Request a quote"}
                        </Link>
                        <Link href={toggleCompare(product.id)} className="btn-secondary btn-sm" scroll={false}>
                          {selected ? "Remove from compare" : "Compare"}
                        </Link>
                        {awaiting ? (
                          <a href="#enquiries" className="rounded-full">
                            <Badge tone={QUOTE_STATUS_TONES[awaiting.status]}>
                              {quoteCount > 0
                                ? `${quoteCount} quote${quoteCount === 1 ? "" : "s"} to review`
                                : QUOTE_STATUS_LABELS.submitted}{" "}
                              · {awaiting.code}
                            </Badge>
                          </a>
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
                        {catalogAction(product)}
                        <Link href={toggleCompare(product.id)} className="btn-secondary btn-sm" scroll={false}>
                          {selected ? "Remove from compare" : "Compare"}
                        </Link>
                        {marketplace ? (
                          <Link href={startEnquiryHref(product.id)} className="btn-ghost btn-sm" scroll={false}>
                            Bulk quote
                          </Link>
                        ) : null}
                        {copies.length > 0 ? (
                          <Badge tone="neutral">
                            Already in this store
                            {copies.length > 1 ? ` · ${copies.length} copies` : ""}
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

      <Callout tone="neutral" title="Bulk sourcing">
        Alibaba.com listings are quoted per enquiry rather than priced per unit. Start an enquiry against a
        listing, any other catalog item or a product you describe; the sourcing desk records each supplier
        quote, you compare them here with the print-on-demand options and accept one, and it is copied into
        the catalog flagged for manual fulfilment — a buyer raises the purchase order by hand.
        {marketplace ? (
          <>
            {" "}
            <Link href={startEnquiryHref()} className="font-medium underline underline-offset-2" scroll={false}>
              Start a bulk enquiry
            </Link>
            .
          </>
        ) : null}
      </Callout>
    </div>
  );
}

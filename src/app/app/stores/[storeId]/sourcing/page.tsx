import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { importCatalogProduct } from "@/app/actions/products";
import { SubmitButton } from "@/components/forms";
import { Badge, Callout, EmptyState, PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listCatalogProducts, listQuoteRequests, listStoreProducts, listSuppliers } from "@/lib/data";
import { requireStoreAccess } from "@/lib/session";
import { storeSku } from "@/lib/sku";
import {
  isQuoteOnly,
  isSourcingAvailability,
  listingAvailability,
  QUOTE_STATUS_TONES,
  quoteIsLive,
  withinUnitCost,
  type BulkSourcingProduct,
} from "@/lib/sourcing";
import type { CatalogProduct, QuoteRequest, StoreProduct, SupplierQuote } from "@/lib/types";
import { formatDate, formatMoney, newId, parseMoney } from "@/lib/util";
import { AcceptedQuoteAction, AcceptQuoteButton, Enquiries } from "./Enquiries";
import { QuoteRequestForm } from "./QuoteRequestForm";
import { SourcingFilters } from "./SourcingFilters";

/** Up to this many listings and quotes sit side by side. */
const COMPARE_LIMIT = 4;

/** The column-head style every table in the workspace shares. */
const TH = "px-0 text-xs font-semibold tracking-wide uppercase text-muted-foreground";

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
async function ConfirmCopyAgain({
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
  const [t, locale] = await Promise.all([getTranslations("sourcing"), getLocale()]);
  return (
    <div className="w-full rounded-lg border border-amber-200 bg-amber-50 p-3" role="group">
      <p className="text-sm font-semibold text-amber-900">
        {t("alreadyIn")}
      </p>
      <ul className="mt-2 space-y-1.5">
        {copies.map((copy) => (
          <li key={copy.id} className="text-xs text-amber-900">
            <Link
              href={`/app/stores/${storeId}/catalog/${copy.id}`}
              className="font-medium underline underline-offset-2"
            >
              {t("openCopy", { name: copy.name })}
            </Link>{" "}
            · <span className="font-mono">{storeSku(copy, channelCode)}</span> ·{" "}
            {t("imported", { date: formatDate(copy.importedAt, locale) })}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-amber-800">{t("newCopy")}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <form action={importCatalogProduct}>
          <CopyFields storeId={storeId} catalogId={catalogId} filters={filters} confirmed />
          <SubmitButton size="sm" pendingLabel={t("copying")}>
            {t("copyAnyway")}
          </SubmitButton>
        </form>
        <Button asChild variant="ghost" size="sm">
          <Link href={cancelHref} scroll={false}>
            {t("cancel")}
          </Link>
        </Button>
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

const COMPARE_ROWS = [
  "supplier",
  "unitCost",
  "minimumOrder",
  "customisation",
  "shipping",
  "ordering",
  "leadTime",
  "variants",
  "printAreas",
  "minDpi",
  "fulfils",
  "availability",
] as const satisfies readonly (keyof CompareColumn)[];

function listingTerms(c: CatalogProduct | undefined, none: string) {
  return {
    variants: c ? `${c.variants.length}` : none,
    printAreas: c ? c.printAreas.map((a) => `${a.name} (${a.widthMm}×${a.heightMm} mm)`).join(", ") : none,
    minDpi: c ? `${c.fileRequirements.minDpi}` : none,
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

const FILTER_KEYS = [
  "q",
  "category",
  "supplier",
  "region",
  "minCost",
  "maxCost",
  "availability",
  "compare",
  "confirm",
  "rfq",
  "ref",
] as const;

type Filters = Partial<Record<(typeof FILTER_KEYS)[number], string>>;

/** What "Clear filters" resets; the comparison and any open form stay. */
const CLEARED_FILTERS = {
  q: undefined,
  category: undefined,
  supplier: undefined,
  region: undefined,
  minCost: undefined,
  maxCost: undefined,
  availability: undefined,
};

/**
 * Query values arrive as a list when a key repeats (a hand-edited address or a
 * stale bookmark). Repeated `compare` values are merged; any other key keeps
 * its first value; anything unreadable is dropped.
 */
function readFilters(raw: Record<string, string | string[] | undefined>): Filters {
  const filters: Filters = {};
  for (const key of FILTER_KEYS) {
    const value = raw[key];
    const list = (Array.isArray(value) ? value : [value])
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter((v) => v !== "");
    if (list.length === 0) continue;
    filters[key] = key === "compare" ? list.join(",") : list[0];
  }
  for (const key of ["minCost", "maxCost"] as const) {
    if (filters[key] && parseMoney(filters[key], "USD") === null) delete filters[key];
  }
  if (!isSourcingAvailability(filters.availability)) delete filters.availability;
  return filters;
}

export default async function SourcingPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { storeId } = await params;
  const filters = readFilters(await searchParams);
  const { store, user } = await requireStoreAccess(storeId, "store.catalog");
  const [t, labels, locale] = await Promise.all([
    getTranslations("sourcing"),
    getTranslations("labels"),
    getLocale(),
  ]);
  const money = (minor: number, currency: string) => formatMoney(minor, currency, locale);
  const formatQuantity = (units: number) => t("units", { count: units });
  const indicativeRange = (product: BulkSourcingProduct) =>
    t("indicative", {
      low: money(product.bulkSourcing.indicativeUnitCost[0], product.currency),
      high: money(product.bulkSourcing.indicativeUnitCost[1], product.currency),
      quantity: formatQuantity(product.bulkSourcing.minimumOrderQuantity),
    });
  const region = (name: string) =>
    labels.has(`region.${name}` as "region.APAC") ? labels(`region.${name}` as "region.APAC") : name;

  const [catalog, suppliers, storeProducts, quoteRequests] = await Promise.all([
    listCatalogProducts(),
    listSuppliers(),
    listStoreProducts(storeId),
    listQuoteRequests(storeId),
  ]);

  const approved = suppliers.filter((s) => s.status === "approved");
  const approvedIds = new Set(approved.map((s) => s.id));
  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? t("unknownSupplier");
  const catalogName = (id: string) => catalog.find((c) => c.id === id)?.name ?? t("retiredListing");
  // The marketplace that takes enquiries for anything not already listed with it.
  const marketplace = approved.find((s) => s.kind === "sourcing_marketplace" && s.capabilities.quotes);

  const regions = [...new Set(catalog.flatMap((c) => c.fulfillmentRegions))].sort();
  const offered = catalog.filter((c) => c.status === "active" && approvedIds.has(c.supplierId));

  const visible = offered
    .filter((c) => matches(c, filters.q ?? ""))
    .filter((c) => !filters.category || c.category === filters.category)
    .filter((c) => !filters.supplier || c.supplierId === filters.supplier)
    .filter((c) => !filters.region || c.fulfillmentRegions.includes(filters.region))
    .filter((c) => !filters.availability || listingAvailability(c) === filters.availability)
    .filter((c) => withinUnitCost(c, filters.minCost, filters.maxCost));

  // Every quote the store has had back, by id, with the enquiry it answers.
  const quotesById = new Map<string, { request: QuoteRequest; quote: SupplierQuote }>();
  for (const request of quoteRequests) {
    for (const quote of request.quotes ?? []) quotesById.set(quote.id, { request, quote });
  }

  const compareIds = [...new Set((filters.compare ?? "").split(",").filter(Boolean))].slice(0, COMPARE_LIMIT);

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
        <Button asChild size="sm">
          <Link href={buildHref({ rfq: c.id, confirm: undefined }, "#rfq")} scroll={false}>
            {t("requestQuote")}
          </Link>
        </Button>
      );
    }
    if (copies.length === 0) {
      return (
        <form action={importCatalogProduct}>
          <CopyFields storeId={storeId} catalogId={c.id} filters={filterString} />
          <SubmitButton size="sm" pendingLabel={t("copying")}>
            {t("copyToStore")}
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
      <Button asChild size="sm">
        <Link href={buildHref({ confirm: c.id })} scroll={false}>
          {t("copyAgain")}
        </Link>
      </Button>
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
      unitCost: quoteOnly ? `${t("byQuote")} · ${indicativeRange(c)}` : money(c.baseCost, c.currency),
      minimumOrder: quoteOnly ? formatQuantity(c.bulkSourcing.minimumOrderQuantity) : formatQuantity(1),
      customisation: quoteOnly ? t("quotedWithRun") : money(c.customizationCostPerArea, c.currency),
      shipping: quoteOnly ? t("freightQuoted") : money(c.shippingEstimate, c.currency),
      ordering: quoteOnly ? t("manualPo") : t("routedAutomatically"),
      leadTime: t("days", { min: c.leadTimeDays[0], max: c.leadTimeDays[1] }),
      ...listingTerms(c, labels("none")),
      fulfils: c.fulfillmentRegions.map(region).join(", "),
      availability: labels(`catalogAvailability.${c.availability}`),
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
          <span className="block text-xs font-normal text-muted-foreground">
            {t("quoteOn", { code: request.code, supplier: quote.supplierLabel })}
          </span>
        </>
      ),
      supplier: t("via", { supplier: quote.supplierLabel, marketplace: request.supplierName }),
      unitCost: `${t("quoted", { amount: money(quote.unitCost, request.currency) })}${
        request.targetUnitCost === null ? "" : t("target", { amount: money(request.targetUnitCost, request.currency) })
      }`,
      minimumOrder: formatQuantity(quote.minimumOrderQuantity),
      customisation: t("includedInQuote"),
      shipping: t("freightQuoted"),
      ordering: t("manualPo"),
      leadTime: t("productionDays", { days: quote.leadTimeDays }),
      ...listingTerms(catalog.find((c) => c.id === quote.baseCatalogProductId), labels("none")),
      fulfils: region(request.destination),
      availability: quote.validUntil
        ? live
          ? t("validUntil", { date: formatDate(quote.validUntil, locale) })
          : t("expired", { date: formatDate(quote.validUntil, locale) })
        : t("noExpiry"),
      action:
        request.status === "accepted" && request.acceptedQuoteId === quote.id ? (
          <AcceptedQuoteAction storeId={storeId} request={request} />
        ) : request.status === "quoted" ? (
          <AcceptQuoteButton storeId={storeId} request={request} quote={quote} />
        ) : (
          <Badge tone={QUOTE_STATUS_TONES[request.status]}>{labels(`quoteStatus.${request.status}`)}</Badge>
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
      ? t("marketplaceHint", { supplier: supplierFilter.name })
      : t("tryFilters");

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        actions={
          marketplace ? (
            <Button asChild variant="outline">
              <Link href={startEnquiryHref()} scroll={false}>
                {t("startEnquiry")}
              </Link>
            </Button>
          ) : null
        }
      />

      <SourcingFilters
        q={filters.q ?? ""}
        category={filters.category ?? ""}
        supplier={filters.supplier ?? ""}
        region={filters.region ?? ""}
        minCost={filters.minCost ?? ""}
        maxCost={filters.maxCost ?? ""}
        availability={filters.availability ?? ""}
        currency={offered[0]?.currency ?? "USD"}
        suppliers={approved.map((supplier) => ({ id: supplier.id, name: supplier.name }))}
        regions={regions}
        compare={filters.compare}
        clearHref={buildHref(CLEARED_FILTERS)}
      />

      {asking || askingGeneral ? (
        <Card asChild className="scroll-mt-6">
        <section id="rfq">
          <CardHeader>
            <div className="min-w-0">
              {asking ? (
                <>
                  <CardTitle asChild>
                    <h2>{t("requestQuoteFor", { name: asking.name })}</h2>
                  </CardTitle>
                  <p className="mt-1 max-w-2xl text-sm text-inksoft">
                    {t("askingMeta", {
                      supplier: supplierName(asking.supplierId),
                      range: indicativeRange(asking),
                      min: asking.bulkSourcing.responseDays[0],
                      max: asking.bulkSourcing.responseDays[1],
                    })}
                  </p>
                  <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{asking.bulkSourcing.quoteNotes}</p>
                </>
              ) : (
                <>
                  <CardTitle asChild>
                    <h2>{t("generalTitle")}</h2>
                  </CardTitle>
                  <p className="mt-1 max-w-2xl text-sm text-inksoft">
                    {t("generalBody")}
                  </p>
                </>
              )}
            </div>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link href={buildHref({ rfq: undefined, ref: undefined })} scroll={false}>
                  {t("close")}
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </section>
        </Card>
      ) : null}

      {columns.length > 0 ? (
        <Card asChild>
        <section>
          <CardHeader>
            <CardTitle asChild>
              <h2>
                {t("comparing", { count: columns.length })}
              </h2>
            </CardTitle>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link href={buildHref({ compare: undefined })}>{t("clearComparison")}</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="relative overflow-x-auto">
              <Table className="min-w-[44rem]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={TH}>{t("attribute")}</TableHead>
                    {columns.map((c) => (
                      <TableHead key={c.key} className="px-0 align-bottom text-sm text-foreground">
                        <div>{c.name}</div>
                        <Link
                          href={toggleCompare(c.key)}
                          className="mt-1 inline-block text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
                          scroll={false}
                        >
                          {t("removeFromComparison")}
                        </Link>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {COMPARE_ROWS.map((row) => (
                    <TableRow key={row} className="hover:bg-transparent">
                      <TableHead scope="row" className={`${TH} normal-case`}>
                        {t(`rows.${row}`)}
                      </TableHead>
                      {columns.map((c) => (
                        <TableCell key={c.key} className="px-0 py-2.5 align-top whitespace-normal text-inksoft">
                          {c[row]}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  <TableRow className="hover:bg-transparent">
                    <TableHead scope="row" className={`${TH} normal-case`}>
                      {t("nextStep")}
                    </TableHead>
                    {columns.map((c) => (
                      <TableCell key={c.key} className="px-0 py-2.5 align-top whitespace-normal">
                        {c.action}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </section>
        </Card>
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
          title={
            supplierFilter?.kind === "sourcing_marketplace"
              ? t("quotesPerEnquiry", { supplier: supplierFilter.name })
              : t("noMatches")
          }
          description={bulkHint}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {supplierFilter?.kind === "sourcing_marketplace" && marketplace ? (
                <Button asChild>
                  <Link href={startEnquiryHref()} scroll={false}>
                    {t("startEnquiry")}
                  </Link>
                </Button>
              ) : null}
              <Button asChild variant="outline">
                <Link href={buildHref(CLEARED_FILTERS)}>{t("clearFilters")}</Link>
              </Button>
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
              <li key={product.id} className="flex">
                <Card className="flex-1 gap-0 py-0">
                {cover ? (
                  <div className="border-b border-border bg-canvas">
                    <Image
                      src={cover.url}
                      alt={t("coverAlt", { name: product.name, colour: cover.colour })}
                      width={640}
                      height={640}
                      loading="lazy"
                      sizes="(min-width: 1280px) 380px, (min-width: 768px) 45vw, 90vw"
                      className="h-auto w-full object-cover"
                      style={{ aspectRatio: "1 / 1" }}
                    />
                  </div>
                ) : null}
                <CardContent className="flex flex-1 flex-col py-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-foreground">{product.name}</h3>
                    <Badge tone={quoteOnly ? "iris" : product.availability === "available" ? "green" : "amber"}>
                      {quoteOnly ? t("bulkSourcing") : labels(`catalogAvailability.${product.availability}`)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {supplierName(product.supplierId)} · {product.productType}
                  </p>
                  <p className="mt-2 line-clamp-3 text-sm text-inksoft">{product.description}</p>

                  <dl className="mt-3 grid grid-cols-2 gap-2 border-y border-border py-3 text-xs">
                    <div>
                      <dt className="text-muted-foreground">{t("unitCost")}</dt>
                      <dd className="font-semibold tabular-nums text-foreground">
                        {quoteOnly ? t("byQuote") : money(product.baseCost, product.currency)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{quoteOnly ? t("minimumOrder") : t("printAreas")}</dt>
                      <dd className="font-semibold tabular-nums text-foreground">
                        {isQuoteOnly(product)
                          ? formatQuantity(product.bulkSourcing.minimumOrderQuantity)
                          : product.printAreas.length}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t("leadTime")}</dt>
                      <dd className="font-semibold tabular-nums text-foreground">
                        {t("days", { min: product.leadTimeDays[0], max: product.leadTimeDays[1] })}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t("variants")}</dt>
                      <dd className="font-semibold tabular-nums text-foreground">{product.variants.length}</dd>
                    </div>
                  </dl>

                  <p className="mt-3 text-xs text-muted-foreground">
                    {t("fulfilsTo", { regions: product.fulfillmentRegions.slice(0, 3).map(region).join(", ") })}
                    {product.fulfillmentRegions.length > 3 ? ` +${product.fulfillmentRegions.length - 3}` : ""}
                  </p>
                  {isQuoteOnly(product) ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("recentRuns", { range: indicativeRange(product) })}
                    </p>
                  ) : null}

                </CardContent>

                  <CardFooter className="mt-auto flex-wrap items-center gap-2">
                    {quoteOnly ? (
                      <>
                        <Button asChild size="sm">
                          <Link
                            href={buildHref({ rfq: product.id, confirm: undefined }, "#rfq")}
                            scroll={false}
                          >
                            {awaiting ? t("anotherRun") : t("requestQuote")}
                          </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm">
                          <Link href={toggleCompare(product.id)} scroll={false}>
                            {selected ? t("removeCompare") : t("compare")}
                          </Link>
                        </Button>
                        {awaiting ? (
                          <a href="#enquiries" className="rounded-full">
                            <Badge tone={QUOTE_STATUS_TONES[awaiting.status]}>
                              {quoteCount > 0
                                ? t("quotesToReview", { count: quoteCount })
                                : labels("quoteStatus.submitted")}{" "}
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
                        <Button asChild variant="outline" size="sm">
                          <Link href={toggleCompare(product.id)} scroll={false}>
                            {selected ? t("removeCompare") : t("compare")}
                          </Link>
                        </Button>
                        {marketplace ? (
                          <Button asChild variant="ghost" size="sm">
                            <Link href={startEnquiryHref(product.id)} scroll={false}>
                              {t("bulkQuote")}
                            </Link>
                          </Button>
                        ) : null}
                        {copies.length > 0 ? (
                          <Badge tone="neutral">
                            {t("alreadyInStore")}
                            {copies.length > 1 ? t("copies", { count: copies.length }) : ""}
                          </Badge>
                        ) : null}
                      </>
                    )}
                  </CardFooter>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Callout tone="neutral" title={t("bulkTitle")}>
        {t("bulkBody")}
        {marketplace ? (
          <>
            {" "}
            <Link href={startEnquiryHref()} className="font-medium underline underline-offset-2" scroll={false}>
              {t("startEnquiry")}
            </Link>
            .
          </>
        ) : null}
      </Callout>
    </div>
  );
}

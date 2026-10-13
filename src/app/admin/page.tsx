import { getLocale, getTranslations } from "next-intl/server";
import { SearchIcon } from "lucide-react";
import Link from "next/link";
import { Badge, PageHeader, StatCard } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  listAgencies,
  listAllStores,
  listAudit,
  listCatalogProducts,
  listPlanEnquiries,
  listSuppliers,
  listTaxBrackets,
} from "@/lib/data";
import { planEnquiryLabel, UNDECIDED } from "@/lib/enquiry";
import { formatDateTime } from "@/lib/util";
import { paymentsReady } from "@/lib/payment-mode";
import {
  filterStoreList,
  parseStoreListFilters,
  storeListQuery,
  STORE_STATUS_FILTERS,
  type StoreListParams,
} from "@/lib/store-list";

/** The column-head style every table in the workspace shares. */
const TH = "px-0 text-xs font-semibold tracking-wide uppercase text-muted-foreground";

export default async function AdminOverviewPage({ searchParams }: { searchParams: Promise<StoreListParams> }) {
  const filters = parseStoreListFilters(await searchParams);
  const [agencies, stores, suppliers, catalog, brackets, audit, enquiries] = await Promise.all([
    listAgencies(),
    listAllStores(),
    listSuppliers(),
    listCatalogProducts(),
    listTaxBrackets(),
    listAudit({}, 12),
    listPlanEnquiries(8),
  ]);

  const pendingSuppliers = suppliers.filter((s) => s.status === "pending_review");
  const activeStores = stores.filter((s) => s.status === "active");
  const agencyName = (id: string) => agencies.find((a) => a.id === id)?.name;
  const storeList = filterStoreList(stores, filters, agencyName);

  const [pages, t, locale] = await Promise.all([
    getTranslations("pages.admin"),
    getTranslations("admin.overview"),
    getLocale(),
  ]);
  return (
    <div className="space-y-7">
      <PageHeader
        title={pages("overviewTitle")}
        description={pages("overviewDescription")}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t("agencies")}
          value={String(agencies.length)}
          sub={t("active", { count: agencies.filter((a) => a.status === "active").length })}
        />
        <StatCard label={t("stores")} value={String(stores.length)} sub={t("active", { count: activeStores.length })} />
        <StatCard
          label={t("approvedSuppliers")}
          value={String(suppliers.filter((s) => s.status === "approved").length)}
          sub={t("awaitingReview", { count: pendingSuppliers.length })}
          tone={pendingSuppliers.length > 0 ? "amber" : "green"}
        />
        <StatCard
          label={t("catalogProducts")}
          value={String(catalog.length)}
          sub={t("taxBrackets", { count: brackets.length })}
        />
      </div>

      {pendingSuppliers.length> 0 ? (
        <Card asChild>
        <section>
            <CardHeader>
              <CardTitle asChild>
                <h2>{t("suppliersAwaiting")}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {pendingSuppliers.map((supplier) => (
                  <li key={supplier.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{supplier.name}</p>
                      <p className="text-xs text-muted-foreground">{supplier.summary}</p>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link href="/admin/suppliers">{t("review")}</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
        </section>
        </Card>
      ) : null}

      <Card asChild>
      <section>
          <CardHeader>
            <CardTitle asChild>
              <h2>{t("storesTitle")}</h2>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {t("storesHidden")}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Plain links and a GET form: the view lives in the URL, and none
                  of the links prefetch another reading of the same table. */}
              <nav aria-label={t("filterByStatus")} className="flex flex-wrap gap-2">
                {STORE_STATUS_FILTERS.map((status) => (
                  <Button key={status} asChild size="sm" variant={filters.status === status ? "default" : "outline"}>
                    <Link
                      href={`/admin${storeListQuery(filters, { status })}`}
                      prefetch={false}
                      scroll={false}
                      aria-current={filters.status === status ? "true" : undefined}
                    >
                      {t(`status.${status}`)}
                      <span className="tabular-nums opacity-70">{storeList.counts[status]}</span>
                    </Link>
                  </Button>
                ))}
              </nav>
              <form method="get" action="/admin" role="search" className="flex items-center gap-2">
                {filters.status !== "active" ? <input type="hidden" name="status" value={filters.status} /> : null}
                <div className="relative">
                  <SearchIcon
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    type="search"
                    name="q"
                    defaultValue={filters.q}
                    aria-label={t("searchStores")}
                    placeholder={t("searchStoresPlaceholder")}
                    className="w-64 pl-8"
                  />
                </div>
                <Button type="submit" variant="outline" size="sm">
                  {t("search")}
                </Button>
                {filters.q ? (
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/admin${storeListQuery(filters, { q: "" })}`} prefetch={false} scroll={false}>
                      {t("clear")}
                    </Link>
                  </Button>
                ) : null}
              </form>
            </div>
            {storeList.rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {filters.q ? t("noStoresMatch") : t("noStores")}
              </p>
            ) : (
            <div className="relative overflow-x-auto">
              <Table className="min-w-[42rem]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={TH}>{t("colStore")}</TableHead>
                    <TableHead className={TH}>{t("colAgency")}</TableHead>
                    <TableHead className={TH}>{t("colCurrencies")}</TableHead>
                    <TableHead className={TH}>{t("colPayments")}</TableHead>
                    <TableHead className={TH}>{t("colStatus")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {storeList.rows.map((store) => (
                    <TableRow key={store.id} className="hover:bg-transparent">
                      <TableCell className="px-0 py-3 align-top whitespace-normal">
                        <Link
                          href={`/app/stores/${store.id}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          {store.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{store.clientName}</p>
                      </TableCell>
                      <TableCell className="px-0 py-3 align-top whitespace-normal text-muted-foreground">
                        {agencyName(store.agencyId) ?? "–"}
                      </TableCell>
                      <TableCell className="px-0 py-3 align-top whitespace-normal text-muted-foreground">
                        {store.currencies.join(", ")}
                      </TableCell>
                      <TableCell className="px-0 py-3 align-top whitespace-normal">
                        <Badge tone={paymentsReady(store) ? "green" : "amber"}>
                          {paymentsReady(store) ? t("stripeConnected") : t("notConnected")}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-0 py-3 align-top whitespace-normal">
                        <Badge tone={store.status === "active" ? "green" : "slate"}>
                          {store.status === "active" ? t("storeActive") : t("storeArchived")}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            )}
          </CardContent>
      </section>
      </Card>

      {enquiries.length> 0 ? (
        <Card asChild>
        <section>
            <CardHeader>
              <CardTitle asChild>
                <h2>{t("enquiries")}</h2>
              </CardTitle>
              <p className="text-sm text-muted-foreground">{t("enquiriesBody")}</p>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {enquiries.map((enquiry) => (
                  <li key={enquiry.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        <Link href={`/admin/enquiries/${enquiry.id}`} className="hover:underline">
                          {enquiry.company} · {enquiry.name}
                        </Link>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <a href={`mailto:${enquiry.email}`} className="hover:underline">
                          {enquiry.email}
                        </a>
                        {enquiry.wantsCall ? t("askedForCall") : null}
                      </p>
                      {enquiry.message ? (
                        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{enquiry.message}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={enquiry.plan === UNDECIDED ? "slate" : "brand"}>
                        {planEnquiryLabel(enquiry.plan) === "Undecided" ? t("undecided") : planEnquiryLabel(enquiry.plan)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(enquiry.createdAt, locale)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
        </section>
        </Card>
      ) : null}

      <Card asChild>
      <section>
          <CardHeader>
            <CardTitle asChild>
              <h2>{t("recentActivity")}</h2>
            </CardTitle>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin/audit">{t("fullAudit")}</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ol className="divide-y divide-border text-sm">
              {audit.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                  <span className="text-foreground">{entry.summary}</span>
                  <span className="text-xs text-muted-foreground">
                    {entry.actorName} · {formatDateTime(entry.at, locale)}
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
      </section>
      </Card>
    </div>
  );
}

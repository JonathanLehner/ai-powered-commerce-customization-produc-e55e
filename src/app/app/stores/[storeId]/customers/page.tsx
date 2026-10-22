import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { ListPager } from "@/components/OrdersPager";
import { EmptyState, PageHeader, StatCard } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { countryName } from "@/i18n/display";
import { listCustomers } from "@/lib/customer-data";
import {
  customerListQuery,
  defaultDir,
  filterCustomers,
  hasCustomerFilters,
  matchesCustomerFilters,
  pageCustomers,
  parseCustomerFilters,
  type CustomerListFilters,
  type CustomerListParams,
  type CustomerSort,
} from "@/lib/customers";
import { requireStoreAccess } from "@/lib/session";
import { formatDate, formatMoney } from "@/lib/util";
import { CustomersToolbar } from "./CustomersToolbar";

const HEAD = "px-4 text-xs font-semibold tracking-wide uppercase text-muted-foreground";

export default async function CustomersPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<CustomerListParams>;
}) {
  const { storeId } = await params;
  const filters = parseCustomerFilters(await searchParams);
  await requireStoreAccess(storeId, "store.orders");

  const [customers, t, labels, locale] = await Promise.all([
    listCustomers(storeId),
    getTranslations("customers"),
    getTranslations("labels"),
    getLocale(),
  ]);
  const now = new Date();
  const matched = filterCustomers(customers, filters, now);
  const page = pageCustomers(matched, filters.page);
  const base = `/app/stores/${storeId}/customers`;
  const recent = customers.filter((c) => matchesCustomerFilters(c, { ...parseCustomerFilters({}), recent: true }, now)).length;
  const repeat = customers.filter((c) => c.orderCount > 1).length;
  const countries = [...new Set(customers.map((c) => c.country).filter(Boolean))]
    .map((code) => ({ code, name: countryName(locale, code) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));

  function sortHead(sort: CustomerSort, label: string, align?: "right") {
    const active = filters.sort === sort;
    const dir = active ? (filters.dir === "asc" ? "desc" : "asc") : defaultDir(sort);
    const next: Partial<CustomerListFilters> = { sort, dir, page: 1 };
    return (
      <TableHead
        className={align === "right" ? `${HEAD} text-right` : HEAD}
        aria-sort={active ? (filters.dir === "asc" ? "ascending" : "descending") : undefined}
      >
        <Link
          href={`${base}${customerListQuery(filters, next)}`}
          prefetch={false}
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          {label}
          {active ? filters.dir === "asc" ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" /> : null}
        </Link>
      </TableHead>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("statCustomers")} value={String(customers.length)} />
        <StatCard label={t("statRepeat")} value={String(repeat)} />
        <StatCard label={t("statRecent")} value={String(recent)} />
      </div>

      <CustomersToolbar
        base={base}
        filters={filters}
        countries={countries}
        exportHref={`${base}/export${customerListQuery(filters, { page: 1 })}`}
        showClear={hasCustomerFilters(filters)}
      />

      {page.total === 0 ? (
        <EmptyState
          title={customers.length === 0 ? t("empty") : t("noMatches")}
          description={customers.length === 0 ? undefined : t("tryFilters")}
        />
      ) : (
        <div className="space-y-3">
          <ListPager
            page={page}
            summary={t("showing", { first: page.first, last: page.last, total: page.total })}
            href={(n) => `${base}${customerListQuery(filters, { page: n })}`}
          />
          <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
            <Table className="min-w-[52rem]">
              <TableHeader className="bg-muted">
                <TableRow className="hover:bg-transparent">
                  {sortHead("name", t("colCustomer"))}
                  <TableHead className={HEAD}>{t("colCountry")}</TableHead>
                  {sortHead("orders", t("colOrders"), "right")}
                  {sortHead("spend", t("colSpend"), "right")}
                  {sortHead("firstOrder", t("colFirstOrder"))}
                  {sortHead("lastOrder", t("colLastOrder"))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.customers.map((customer) => (
                  <TableRow key={customer.id} className="relative">
                    <TableCell className="px-4 py-3 align-top whitespace-normal">
                      <Link
                        href={`${base}/${customer.id}`}
                        className="font-medium text-foreground after:absolute after:inset-0 after:content-[''] hover:underline"
                      >
                        {customer.anonymisedAt ? t("deleted") : customer.name}
                      </Link>
                      {customer.anonymisedAt ? null : (
                        <p className="text-xs text-muted-foreground">{customer.email}</p>
                      )}
                      {customer.refundCount > 0 ? (
                        <Badge variant="outline" className="mt-1">
                          {t("refundBadge", { count: customer.refundCount })}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="px-4 py-3 align-top text-inksoft">
                      {customer.country ? countryName(locale, customer.country) : labels("notSet")}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right align-top tabular-nums">{customer.orderCount}</TableCell>
                    <TableCell className="px-4 py-3 text-right align-top font-medium tabular-nums text-foreground">
                      {formatMoney(customer.lifetimeSpend, customer.currency, locale)}
                    </TableCell>
                    <TableCell className="px-4 py-3 align-top text-inksoft">
                      {customer.firstOrderAt ? formatDate(customer.firstOrderAt, locale) : labels("none")}
                    </TableCell>
                    <TableCell className="px-4 py-3 align-top text-inksoft">
                      {customer.lastOrderAt ? formatDate(customer.lastOrderAt, locale) : labels("none")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ListPager
            page={page}
            summary={t("showing", { first: page.first, last: page.last, total: page.total })}
            href={(n) => `${base}${customerListQuery(filters, { page: n })}`}
          />
        </div>
      )}
    </div>
  );
}

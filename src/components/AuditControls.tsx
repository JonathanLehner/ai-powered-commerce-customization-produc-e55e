"use client";

import { DownloadIcon, SearchIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  auditQuery,
  hasAuditFilters,
  type AuditActor,
  type AuditFilters,
  type AuditPage,
} from "@/lib/audit-log";
import { AUDIT_CATEGORY_LABELS, type AuditCategory } from "@/lib/types";

/**
 * The controls above and below the audit list, shared by a store's Activity page
 * and the platform log so both read and behave the same. Everything is a plain
 * GET form and ordinary links: the filters live in the URL, which is what makes
 * a filtered view something you can bookmark, share and download.
 *
 * The "made by" dropdown carries this sentinel for "anyone", because Radix
 * refuses an empty option value; a hidden field posts it back as the blank the
 * page already reads.
 *
 * None of these links prefetch. Every one of them leads to a different reading
 * of the history, and prefetching them all rendered the page forty times over in
 * the background for the one view somebody actually asked for.
 */

const ANYONE = "all";

export function AuditFilterBar({
  basePath,
  filters,
  actors,
  exportHref,
  exportNote,
}: {
  basePath: string;
  filters: AuditFilters;
  actors: AuditActor[];
  /** null when the plan does not include the download. */
  exportHref: string | null;
  exportNote?: string;
}) {
  const [actor, setActor] = useState(filters.actorId ?? ANYONE);
  const t = useTranslations("audit");
  const labels = useTranslations("labels");

  return (
    <div className="space-y-3">
      <nav aria-label={t("filterByCategory")} className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant={!filters.category ? "default" : "outline"}>
          <Link
            href={`${basePath}${auditQuery(filters, { category: null, page: 1 })}`}
            prefetch={false}
            aria-current={!filters.category ? "true" : undefined}
          >
            {t("all")}
          </Link>
        </Button>
        {(Object.keys(AUDIT_CATEGORY_LABELS) as AuditCategory[]).map((key) => (
          <Button
            key={key}
            asChild
            size="sm"
            variant={filters.category === key ? "default" : "outline"}
          >
            <Link
              href={`${basePath}${auditQuery(filters, { category: key, page: 1 })}`}
              prefetch={false}
              aria-current={filters.category === key ? "true" : undefined}
            >
              {labels(`auditCategory.${key}`)}
            </Link>
          </Button>
        ))}
      </nav>

      <Card size="sm" asChild>
        <form method="get" action={basePath}>
          <CardContent className="flex flex-wrap items-end gap-3">
            {/* The chips above set the category; the form carries it through. */}
            {filters.category ? <input type="hidden" name="category" value={filters.category} /> : null}
            <div className="min-w-[14rem] flex-1">
              <Label htmlFor="audit-q" className="text-xs">
                {t("search")}
              </Label>
              <div className="relative mt-1.5">
                <SearchIcon
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="audit-q"
                  name="q"
                  defaultValue={filters.q}
                  placeholder={t("searchPlaceholder")}
                  className="pl-8"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="audit-actor" className="text-xs">
                {t("madeBy")}
              </Label>
              <input type="hidden" name="actor" value={actor === ANYONE ? "" : actor} />
              <Select value={actor} onValueChange={setActor}>
                <SelectTrigger id="audit-actor" className="mt-1.5 w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANYONE}>{t("anyone")}</SelectItem>
                  {actors.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="audit-from" className="text-xs">
                {t("from")}
              </Label>
              <Input
                id="audit-from"
                type="date"
                name="from"
                defaultValue={filters.from ?? ""}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="audit-to" className="text-xs">
                {t("to")}
              </Label>
              <Input
                id="audit-to"
                type="date"
                name="to"
                defaultValue={filters.to ?? ""}
                className="mt-1.5"
              />
            </div>
            <Button type="submit" variant="outline">
              {t("filter")}
            </Button>
            {hasAuditFilters(filters) ? (
              <Button asChild variant="ghost">
                <Link href={basePath} prefetch={false}>
                  {t("clear")}
                </Link>
              </Button>
            ) : null}
            <span className="ml-auto flex items-center gap-2">
              {exportHref ? (
                // A download, not a navigation: the browser saves the CSV the
                // route handler returns and leaves the page where it is.
                <Button asChild variant="outline">
                  <a href={exportHref} download>
                    <DownloadIcon />
                    {t("download")}
                  </a>
                </Button>
              ) : (
                <Button type="button" variant="outline" disabled title={exportNote}>
                  <DownloadIcon />
                  {t("download")}
                </Button>
              )}
            </span>
          </CardContent>
        </form>
      </Card>
      {!exportHref && exportNote ? <p className="text-xs text-muted-foreground">{exportNote}</p> : null}
    </div>
  );
}

/** "Showing 1–25 of 132", with the way to the next screenful. */
export function AuditPager({
  basePath,
  filters,
  page,
}: {
  basePath: string;
  filters: AuditFilters;
  page: AuditPage;
}) {
  const t = useTranslations("pager");
  const common = useTranslations("common");
  if (page.total === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground tabular-nums">
        {t("audit", { first: page.first, last: page.last, total: page.total })}
      </p>
      {page.pages > 1 ? (
        <Pagination aria-label={common("pages")} className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              {page.page > 1 ? (
                <PaginationPrevious
                  href={`${basePath}${auditQuery(filters, { page: page.page - 1 })}`}
                  rel="prev"
                  text={common("previous")}
                  aria-label={common("previousPage")}
                />
              ) : (
                <PaginationPrevious
                  aria-disabled
                  className="pointer-events-none opacity-50"
                  text={common("previous")}
                  aria-label={common("previousPage")}
                />
              )}
            </PaginationItem>
            <PaginationItem>
              <span className="px-2 text-xs tabular-nums text-muted-foreground">
                {common("pageOf", { page: page.page, pages: page.pages })}
              </span>
            </PaginationItem>
            <PaginationItem>
              {page.page < page.pages ? (
                <PaginationNext
                  href={`${basePath}${auditQuery(filters, { page: page.page + 1 })}`}
                  rel="next"
                  text={common("next")}
                  aria-label={common("nextPage")}
                />
              ) : (
                <PaginationNext
                  aria-disabled
                  className="pointer-events-none opacity-50"
                  text={common("next")}
                  aria-label={common("nextPage")}
                />
              )}
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : null}
    </div>
  );
}

/**
 * Says so when the history goes back further than one screen's worth of reading
 * covered, rather than letting the list imply it has reached the beginning.
 */
export function AuditCoverageNote({ coveredFrom }: { coveredFrom: string }) {
  const t = useTranslations("pager");
  const format = useFormatter();
  return (
    <p className="text-xs text-muted-foreground">
      {t("auditCoverage", { date: format.dateTime(new Date(coveredFrom), "date") })}
    </p>
  );
}

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { orderListQuery, type OrderListFilters, type OrderListPage } from "@/lib/order-list";

/**
 * "Showing 1–25 of 132", with the way to the next screenful — the Activity
 * page's pager, reading the order queue's own filters so every page of the
 * table is a URL that can be bookmarked and shared.
 *
 * Nothing here prefetches: each link is a different screenful of orders, and
 * prefetching them all rendered the page over and over in the background for
 * the one page somebody actually asked for.
 */

/** Page numbers around the current one, with gaps marked by `null`. */
function windowed(page: number, pages: number): (number | null)[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const around = [page - 1, page, page + 1].filter((n) => n > 1 && n < pages);
  const numbers = [1, ...around, pages];
  const out: (number | null)[] = [];
  numbers.forEach((n, i) => {
    if (i > 0 && n - numbers[i - 1] > 1) out.push(null);
    out.push(n);
  });
  return out;
}

export function OrdersPager({
  basePath,
  filters,
  page,
}: {
  basePath: string;
  filters: OrderListFilters;
  page: OrderListPage;
}) {
  if (page.total === 0) return null;
  const href = (n: number) => `${basePath}${orderListQuery(filters, { page: n })}`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">
        Showing <span className="tabular-nums">{page.first}</span>–
        <span className="tabular-nums">{page.last}</span> of{" "}
        <span className="tabular-nums">{page.total}</span> orders
      </p>
      {page.pages > 1 ? (
        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href={page.page > 1 ? href(page.page - 1) : undefined}
                rel="prev"
                aria-disabled={page.page > 1 ? undefined : true}
                className={page.page > 1 ? undefined : "pointer-events-none opacity-50"}
              />
            </PaginationItem>
            {windowed(page.page, page.pages).map((n, i) => (
              <PaginationItem key={n ?? `gap-${i}`} className="hidden sm:block">
                {n === null ? (
                  <PaginationEllipsis />
                ) : (
                  <PaginationLink href={href(n)} isActive={n === page.page} className="tabular-nums">
                    {n}
                  </PaginationLink>
                )}
              </PaginationItem>
            ))}
            <PaginationItem className="sm:hidden">
              <span className="px-2 text-xs text-muted-foreground tabular-nums">
                Page {page.page} of {page.pages}
              </span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                href={page.page < page.pages ? href(page.page + 1) : undefined}
                rel="next"
                aria-disabled={page.page < page.pages ? undefined : true}
                className={page.page < page.pages ? undefined : "pointer-events-none opacity-50"}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : null}
    </div>
  );
}

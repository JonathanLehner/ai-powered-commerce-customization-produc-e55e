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
 * The page numbers worth printing: the ends, and a window around the page being
 * read. `null` is where the run of numbers is broken.
 */
function pageWindow(current: number, pages: number): (number | null)[] {
  const wanted = new Set([1, pages, current - 1, current, current + 1]);
  const shown = [...wanted].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  return shown.flatMap((n, i) => (i > 0 && n - shown[i - 1] > 1 ? [null, n] : [n]));
}

/**
 * "Showing 1–25 of 132", with the way to the next screenful — the Activity
 * page's pager, reading the order queue's own filters so every page of the
 * table is a URL that can be bookmarked and shared.
 *
 * Nothing here prefetches: each link is a different screenful of orders, and
 * prefetching them all rendered the page over and over in the background for
 * the one page somebody actually asked for.
 */
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
                aria-disabled={page.page === 1 || undefined}
                className={page.page === 1 ? "pointer-events-none opacity-50" : undefined}
              />
            </PaginationItem>
            {pageWindow(page.page, page.pages).map((n, i) =>
              n === null ? (
                <PaginationItem key={`gap-${i}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={n}>
                  <PaginationLink href={href(n)} isActive={n === page.page} className="tabular-nums">
                    {n}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}
            <PaginationItem>
              <PaginationNext
                href={page.page < page.pages ? href(page.page + 1) : undefined}
                rel="next"
                aria-disabled={page.page === page.pages || undefined}
                className={page.page === page.pages ? "pointer-events-none opacity-50" : undefined}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : null}
    </div>
  );
}

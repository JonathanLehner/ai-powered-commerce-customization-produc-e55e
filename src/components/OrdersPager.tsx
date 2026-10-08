import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { orderListQuery, type OrderListFilters, type OrderListPage } from "@/lib/order-list";

/**
 * "Showing 1–25 of 132", with the way to the next screenful — the Activity
 * page's pager, reading the order queue's own filters so every page of the
 * table is a URL that can be bookmarked and shared.
 *
 * The shadcn Pagination links are plain anchors on purpose: each one is a
 * different screenful of orders, and the router prefetching them rendered the
 * page over and over in the background for the one page somebody asked for.
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
        <Pagination aria-label="Pages" className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              {page.page > 1 ? (
                <PaginationPrevious href={href(page.page - 1)} rel="prev" />
              ) : (
                <PaginationPrevious aria-disabled className="pointer-events-none opacity-50" />
              )}
            </PaginationItem>
            <PaginationItem>
              <span className="px-2 text-xs text-muted-foreground tabular-nums">
                Page {page.page} of {page.pages}
              </span>
            </PaginationItem>
            <PaginationItem>
              {page.page < page.pages ? (
                <PaginationNext href={href(page.page + 1)} rel="next" />
              ) : (
                <PaginationNext aria-disabled className="pointer-events-none opacity-50" />
              )}
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : null}
    </div>
  );
}

import Link from "next/link";
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
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted">
        Showing <span className="tabular-nums">{page.first}</span>–
        <span className="tabular-nums">{page.last}</span> of{" "}
        <span className="tabular-nums">{page.total}</span> orders
      </p>
      {page.pages > 1 ? (
        <nav aria-label="Pages" className="flex items-center gap-2">
          {page.page > 1 ? (
            <Link
              href={`${basePath}${orderListQuery(filters, { page: page.page - 1 })}`}
              prefetch={false}
              className="btn-secondary btn-sm"
              rel="prev"
            >
              Previous
            </Link>
          ) : (
            <span className="btn-secondary btn-sm cursor-not-allowed opacity-50" aria-disabled="true">
              Previous
            </span>
          )}
          <span className="text-xs text-muted tabular-nums">
            Page {page.page} of {page.pages}
          </span>
          {page.page < page.pages ? (
            <Link
              href={`${basePath}${orderListQuery(filters, { page: page.page + 1 })}`}
              prefetch={false}
              className="btn-secondary btn-sm"
              rel="next"
            >
              Next
            </Link>
          ) : (
            <span className="btn-secondary btn-sm cursor-not-allowed opacity-50" aria-disabled="true">
              Next
            </span>
          )}
        </nav>
      ) : null}
    </div>
  );
}

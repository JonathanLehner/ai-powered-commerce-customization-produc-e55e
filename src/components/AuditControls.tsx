import Link from "next/link";
import {
  auditQuery,
  hasAuditFilters,
  type AuditActor,
  type AuditFilters,
  type AuditPage,
} from "@/lib/audit-log";
import { AUDIT_CATEGORY_LABELS, type AuditCategory } from "@/lib/types";
import { formatDate } from "@/lib/util";

/**
 * The controls above and below the audit list, shared by a store's Activity page
 * and the platform log so both read and behave the same. Everything is a plain
 * GET form and ordinary links: the filters live in the URL, which is what makes
 * a filtered view something you can bookmark, share and download.
 *
 * None of these links prefetch. Every one of them leads to a different reading
 * of the history, and prefetching them all rendered the page forty times over in
 * the background for the one view somebody actually asked for.
 */

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
  return (
    <div className="space-y-3">
      <nav aria-label="Filter by category" className="flex flex-wrap gap-2">
        <Link
          href={`${basePath}${auditQuery(filters, { category: null, page: 1 })}`}
          prefetch={false}
          aria-current={!filters.category ? "true" : undefined}
          className={!filters.category ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
        >
          All
        </Link>
        {(Object.keys(AUDIT_CATEGORY_LABELS) as AuditCategory[]).map((key) => (
          <Link
            key={key}
            href={`${basePath}${auditQuery(filters, { category: key, page: 1 })}`}
            prefetch={false}
            aria-current={filters.category === key ? "true" : undefined}
            className={filters.category === key ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
          >
            {AUDIT_CATEGORY_LABELS[key]}
          </Link>
        ))}
      </nav>

      <form method="get" action={basePath} className="card flex flex-wrap items-end gap-3 p-4">
        {/* The chips above set the category; the form carries it through. */}
        {filters.category ? <input type="hidden" name="category" value={filters.category} /> : null}
        <div className="min-w-[14rem] flex-1">
          <label htmlFor="audit-q" className="field-label text-xs">
            Search
          </label>
          <input
            id="audit-q"
            name="q"
            defaultValue={filters.q}
            placeholder="Anything in the entry — product, order, setting"
            className="input py-1.5"
          />
        </div>
        <div>
          <label htmlFor="audit-actor" className="field-label text-xs">
            Made by
          </label>
          <select id="audit-actor" name="actor" defaultValue={filters.actorId ?? ""} className="input py-1.5">
            <option value="">Anyone</option>
            {actors.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="audit-from" className="field-label text-xs">
            From
          </label>
          <input
            id="audit-from"
            type="date"
            name="from"
            defaultValue={filters.from ?? ""}
            className="input py-1.5"
          />
        </div>
        <div>
          <label htmlFor="audit-to" className="field-label text-xs">
            To
          </label>
          <input id="audit-to" type="date" name="to" defaultValue={filters.to ?? ""} className="input py-1.5" />
        </div>
        <button type="submit" className="btn-secondary">
          Filter
        </button>
        {hasAuditFilters(filters) ? (
          <Link href={basePath} prefetch={false} className="btn-ghost">
            Clear
          </Link>
        ) : null}
        <span className="ml-auto flex items-center gap-2">
          {exportHref ? (
            // A download, not a navigation: the browser saves the CSV the route
            // handler returns and leaves the page where it is.
            <a href={exportHref} download className="btn-secondary">
              Download spreadsheet
            </a>
          ) : (
            <span className="btn-secondary cursor-not-allowed opacity-50" aria-disabled="true" title={exportNote}>
              Download spreadsheet
            </span>
          )}
        </span>
      </form>
      {!exportHref && exportNote ? <p className="text-xs text-muted">{exportNote}</p> : null}
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
  if (page.total === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted">
        Showing <span className="tabular-nums">{page.first}</span>–
        <span className="tabular-nums">{page.last}</span> of{" "}
        <span className="tabular-nums">{page.total}</span> entries
      </p>
      {page.pages > 1 ? (
        <nav aria-label="Pages" className="flex items-center gap-2">
          {page.page > 1 ? (
            <Link
              href={`${basePath}${auditQuery(filters, { page: page.page - 1 })}`}
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
              href={`${basePath}${auditQuery(filters, { page: page.page + 1 })}`}
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

/**
 * Says so when the history goes back further than one screen's worth of reading
 * covered, rather than letting the list imply it has reached the beginning.
 */
export function AuditCoverageNote({ coveredFrom }: { coveredFrom: string }) {
  return (
    <p className="text-xs text-muted">
      Loaded back to {formatDate(coveredFrom)}. Older activity is still recorded — set a date range to read it.
    </p>
  );
}

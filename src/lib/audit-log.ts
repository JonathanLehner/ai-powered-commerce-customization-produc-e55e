/**
 * Reading the audit trail: the filters a person sets on a store's Activity page
 * and on the platform log, the paging under the list, and the spreadsheet they
 * download from either one.
 *
 * Everything here is pure, so `npm run audit-check` exercises the filtering, the
 * paging, the collapsing and the CSV without a database. The fetching itself
 * lives in `lib/data.ts`, which is where the platform API's document cap has to
 * be worked around.
 */
import { AUDIT_CATEGORY_LABELS, type AuditCategory, type AuditLog } from "./types";
import { slugify } from "./util";

/** Entries per page. The list is read top to bottom, so a screenful at a time. */
export const AUDIT_PAGE_SIZE = 25;

/** How much history a page load pulls in, and how much a download pulls in. */
export const AUDIT_VIEW_CAP = 400;
export const AUDIT_EXPORT_CAP = 2000;

export interface AuditFilters {
  category: AuditCategory | null;
  /** The person who made the change, by actor id. */
  actorId: string | null;
  /** Inclusive calendar days in UTC, `YYYY-MM-DD`, or null for no bound. */
  from: string | null;
  to: string | null;
  q: string;
  page: number;
}

/** The query parameters the two pages accept, straight off the URL. */
export interface AuditParams {
  category?: string | string[];
  actor?: string | string[];
  from?: string | string[];
  to?: string | string[];
  q?: string | string[];
  page?: string | string[];
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? (value[0] ?? "") : (value ?? "")).trim();
}

export function isAuditCategory(value: string): value is AuditCategory {
  return value in AUDIT_CATEGORY_LABELS;
}

/** A calendar day the browser's date input produced, or null for anything else. */
function day(value: string): string | null {
  if (!DAY_PATTERN.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  // Rejects the 31st of a 30-day month, which `Date` would roll forward.
  return parsed.toISOString().slice(0, 10) === value ? value : null;
}

export function parseAuditFilters(params: AuditParams): AuditFilters {
  const category = one(params.category);
  const from = day(one(params.from));
  const to = day(one(params.to));
  const reversed = from !== null && to !== null && from > to;
  const page = Number.parseInt(one(params.page), 10);
  return {
    category: category && isAuditCategory(category) ? category : null,
    actorId: one(params.actor) || null,
    // A range typed the wrong way round is read as the span between the two
    // days rather than as an empty result nobody can explain.
    from: reversed ? to : from,
    to: reversed ? from : to,
    q: one(params.q),
    page: Number.isFinite(page) && page > 1 ? page : 1,
  };
}

export function hasAuditFilters(filters: AuditFilters): boolean {
  return Boolean(filters.category || filters.actorId || filters.from || filters.to || filters.q);
}

/** The instant range a day range covers: `from` inclusive, `to` exclusive. */
export function auditRange(filters: AuditFilters): { from: string | null; to: string | null } {
  return {
    from: filters.from ? `${filters.from}T00:00:00.000Z` : null,
    to: filters.to ? `${shiftDays(`${filters.to}T00:00:00.000Z`, 1)}` : null,
  };
}

/** Moves an instant a whole number of days, keeping it an ISO string. */
export function shiftDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export interface AuditReadWindow {
  from: string;
  to: string;
  /**
   * True when no start date was asked for, so `from` is only where the reading
   * begins and anything older than it still belongs in the result.
   */
  openStart: boolean;
}

/**
 * The instant window a view has to read to answer its filters: the dates the
 * person chose, or everything from just before the oldest record expected in
 * this scope up to now.
 */
export function auditWindow(filters: AuditFilters, earliest: string, now: string): AuditReadWindow {
  const range = auditRange(filters);
  return {
    from: range.from ?? shiftDays(earliest, -31),
    // A day forward, so an entry written a moment ago is never outside the window.
    to: range.to ?? shiftDays(now, 1),
    openStart: range.from === null,
  };
}

/**
 * The window split into UTC calendar months, newest first.
 *
 * The platform API caps a `find` and applies neither sort nor skip, so the only
 * way to read history newest-first is to ask for one slice of time at a time.
 * Months are the unit: coarse enough that an ordinary range is a handful of
 * reads, fine enough that stopping early still leaves a whole month covered.
 */
export function auditMonthBuckets(from: string, to: string): { from: string; to: string }[] {
  const start = new Date(from);
  const buckets: { from: string; to: string }[] = [];
  let end = new Date(to);
  // Ten years of months is far past any real range, and stops a bad input
  // (an unparsable date, a reversed window) from looping.
  while (end.getTime() > start.getTime() && buckets.length < 120) {
    const monthStart = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1);
    // An end exactly on a month boundary belongs to the month before it.
    const boundary =
      monthStart === end.getTime()
        ? new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1))
        : new Date(monthStart);
    const bucketFrom = boundary.getTime() < start.getTime() ? start : boundary;
    buckets.push({ from: bucketFrom.toISOString(), to: end.toISOString() });
    end = boundary;
  }
  return buckets;
}

/** The meta line shown under an entry, and the detail column in the export. */
export function auditDetail(entry: AuditLog): string {
  return Object.entries(entry.meta ?? {})
    .map(([key, value]) => `${key}: ${value}`)
    .join(" · ");
}

export function auditCategoryLabel(entry: AuditLog): string {
  return AUDIT_CATEGORY_LABELS[entry.category] ?? entry.category;
}

/* ------------------------------------------------- reading it with platform access */

/** Stands in for a shopper's name in an entry a platform administrator reads. */
export const PLATFORM_AUDIT_ACTOR = "Shopper (name withheld)";

/**
 * Audit actors that are a shopper rather than someone on a store or agency
 * team: a gift buyer submits, approves and pays for a campaign under their own
 * name, and the log records that name.
 */
const SHOPPER_ACTOR_IDS = new Set(["gifting", "shopper"]);

/** Meta keys holding an order value, which platform access does not carry. */
const ORDER_VALUE_META = new Set(["total", "amount", "currency"]);

/**
 * Summaries that name a shopper or an amount, rewritten to the fact alone.
 * Anything not listed here is written from the store team's own actions and is
 * kept as recorded — that is the operational history platform access is for.
 */
const PLATFORM_SUMMARIES: Record<string, (entry: AuditLog) => string> = {
  "gifting.campaign_created": (entry) => `Gift campaign ${entry.entityId} submitted`,
  "gifting.campaign_approved": (entry) => `Gift campaign ${entry.entityId} approved for payment`,
  "gifting.campaign_declined": (entry) => `Gift campaign ${entry.entityId} declined`,
  "gifting.campaign_cancelled": (entry) => `Gift campaign ${entry.entityId} withdrawn before payment`,
  "order.refunded": (entry) => `Refund recorded on ${entry.entityId}`,
  "order.cancelled_refunded": (entry) => `${entry.entityId} cancelled and refunded`,
};

/**
 * One entry as platform access may read it.
 *
 * A platform administrator holds no membership in a store, so the log tells
 * them what happened without telling them who the shopper was or what they
 * paid. Entries are rewritten rather than dropped: the platform still has to
 * see that a campaign was submitted or a refund was made.
 *
 * Redact before filtering, so a search or a "made by" filter cannot be used to
 * confirm a name that is not shown.
 */
export function platformAuditEntry(entry: AuditLog): AuditLog {
  const rewrite = PLATFORM_SUMMARIES[entry.action];
  const shopper = SHOPPER_ACTOR_IDS.has(entry.actorId);
  const meta = Object.entries(entry.meta ?? {}).filter(([key]) => !ORDER_VALUE_META.has(key));
  if (!rewrite && !shopper && meta.length === Object.keys(entry.meta ?? {}).length) return entry;
  return {
    ...entry,
    summary: rewrite ? rewrite(entry) : entry.summary,
    actorName: shopper ? PLATFORM_AUDIT_ACTOR : entry.actorName,
    meta: Object.fromEntries(meta),
  };
}

export function platformAuditEntries(entries: AuditLog[]): AuditLog[] {
  return entries.map(platformAuditEntry);
}

function searchText(entry: AuditLog): string {
  return [entry.summary, entry.action, entry.actorName, auditCategoryLabel(entry), auditDetail(entry)]
    .join(" ")
    .toLowerCase();
}

/**
 * Whether an entry survives the filters. The category and the dates are also
 * asked of the database, but they are re-applied here so a filtered list and a
 * filtered download can never disagree about what they contain.
 */
export function matchesAuditFilters(entry: AuditLog, filters: AuditFilters): boolean {
  if (filters.category && entry.category !== filters.category) return false;
  if (filters.actorId && entry.actorId !== filters.actorId) return false;
  const range = auditRange(filters);
  if (range.from && entry.at < range.from) return false;
  if (range.to && entry.at >= range.to) return false;
  if (!filters.q) return true;
  const haystack = searchText(entry);
  // Every word has to appear, so "sam mockup" narrows rather than widens.
  return filters.q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

/** Newest first, with the id breaking ties so the order is stable. */
export function sortAuditEntries(entries: AuditLog[]): AuditLog[] {
  return [...entries].sort((a, b) => (a.at === b.at ? b.id.localeCompare(a.id) : a.at < b.at ? 1 : -1));
}

export interface AuditPage {
  entries: AuditLog[];
  page: number;
  pages: number;
  total: number;
  /** 1-based position of the first and last entry on this page. */
  first: number;
  last: number;
}

export function pageAuditEntries(entries: AuditLog[], page: number, size = AUDIT_PAGE_SIZE): AuditPage {
  const total = entries.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const start = (current - 1) * size;
  const slice = entries.slice(start, start + size);
  return {
    entries: slice,
    page: current,
    pages,
    total,
    first: total === 0 ? 0 : start + 1,
    last: start + slice.length,
  };
}

export interface AuditRun {
  /** The newest entry of the run — what the row is drawn from. */
  entry: AuditLog;
  count: number;
  earliest: string;
  latest: string;
}

/** The UTC calendar day an instant falls on, as `YYYY-MM-DD`. */
function auditDay(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Collapses a run of neighbouring entries that say exactly the same thing, were
 * written by the same person, and fall on the same calendar day.
 *
 * Approving the same two mockups eight times in a row is eight real records and
 * they all belong in the full history and in the export, but in a short "Recent
 * activity" summary they were eight identical rows that pushed everything else
 * out of view. A day boundary keeps the row honest: the count is always
 * something that happened on the date the row shows.
 */
export function collapseAuditRuns(entries: AuditLog[]): AuditRun[] {
  const runs: AuditRun[] = [];
  for (const entry of entries) {
    const last = runs[runs.length - 1];
    const same =
      last &&
      last.entry.action === entry.action &&
      last.entry.summary === entry.summary &&
      last.entry.actorId === entry.actorId &&
      last.entry.category === entry.category &&
      auditDay(last.entry.at) === auditDay(entry.at);
    if (same) {
      last.count += 1;
      last.earliest = entry.at < last.earliest ? entry.at : last.earliest;
      last.latest = entry.at > last.latest ? entry.at : last.latest;
      continue;
    }
    runs.push({ entry, count: 1, earliest: entry.at, latest: entry.at });
  }
  return runs;
}

/**
 * The rows a "Recent activity" panel draws: newest first, repeats collapsed,
 * cut to the number of rows the panel has room for.
 *
 * The caller reads more history than it shows, because a collapsed run is one
 * row made of many records and a feed that read exactly `rows` entries would
 * shrink to a single line on the day someone approved the same thing eight
 * times.
 */
export function recentAuditRuns(entries: AuditLog[], rows: number): AuditRun[] {
  return collapseAuditRuns(sortAuditEntries(entries)).slice(0, Math.max(0, rows));
}

/**
 * How many entries a panel reads to fill `rows` collapsed rows. Generous rather
 * than exact: reading is one round trip either way.
 */
export function recentAuditReadSize(rows: number): number {
  return rows * 5;
}

/** e.g. `Approved 2 mockups for “Northwind Field Tee” — 8 times`. */
export function auditRunSummary(run: AuditRun): string {
  return run.count > 1 ? `${run.entry.summary} — ${run.count} times` : run.entry.summary;
}

export interface AuditActor {
  id: string;
  name: string;
}

/**
 * The people to offer in the "made by" filter, taken from the history in view.
 * A selected actor is kept even when the rest of the filters leave none of their
 * entries in the set, so the dropdown always shows what is actually applied.
 */
export function auditActors(entries: AuditLog[], selected?: string | null): AuditActor[] {
  const names = new Map<string, string>();
  for (const entry of entries) {
    if (!names.has(entry.actorId)) names.set(entry.actorId, entry.actorName || entry.actorId);
  }
  if (selected && !names.has(selected)) {
    const known = entries.find((entry) => entry.actorId === selected);
    names.set(selected, known?.actorName || selected);
  }
  return [...names.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The query string for a link that keeps the current filters. */
export function auditQuery(filters: AuditFilters, overrides: Partial<AuditFilters> = {}): string {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (merged.category) params.set("category", merged.category);
  if (merged.actorId) params.set("actor", merged.actorId);
  if (merged.from) params.set("from", merged.from);
  if (merged.to) params.set("to", merged.to);
  if (merged.q) params.set("q", merged.q);
  if (merged.page > 1) params.set("page", String(merged.page));
  const query = params.toString();
  return query ? `?${query}` : "";
}

/* --------------------------------------------------------------- the export */

export const AUDIT_CSV_COLUMNS = ["Timestamp (UTC)", "Person", "Category", "Action", "Summary", "Detail"];

/**
 * A spreadsheet of the entries as filtered.
 *
 * Written as CSV, which every spreadsheet opens: a byte-order mark so Excel
 * reads the UTF-8, CRLF line endings, and a leading apostrophe on anything a
 * spreadsheet would otherwise treat as a formula.
 */
export function auditCsv(
  entries: AuditLog[],
  options: { storeName?: (storeId: string | null) => string } = {},
): string {
  const withStore = typeof options.storeName === "function";
  const header = withStore
    ? [AUDIT_CSV_COLUMNS[0], "Store", ...AUDIT_CSV_COLUMNS.slice(1)]
    : AUDIT_CSV_COLUMNS;
  const rows = entries.map((entry) => {
    const cells = [
      entry.at,
      entry.actorName || entry.actorId,
      auditCategoryLabel(entry),
      entry.action,
      entry.summary,
      auditDetail(entry),
    ];
    return withStore
      ? [cells[0], options.storeName!(entry.storeId), ...cells.slice(1)]
      : cells;
  });
  return `﻿${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

function csvCell(value: string): string {
  const text = value ?? "";
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /["\n\r,]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** e.g. `northwind-supply-co-activity-2026-05-01-to-2026-08-05.csv`. */
export function auditFileName(label: string, filters: AuditFilters, today: string): string {
  const span =
    filters.from || filters.to
      ? `${filters.from ?? "start"}-to-${filters.to ?? today}`
      : today;
  return `${slugify(label) || "audit"}-${span}.csv`;
}

export function auditCsvResponse(csv: string, fileName: string): Response {
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${fileName}"`,
      "cache-control": "no-store",
    },
  });
}

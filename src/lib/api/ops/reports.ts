import "server-only";
import { z } from "zod";
import { MAX_RANGE_DAYS, parseRange } from "../../analytics";
import { loadDailySeries, loadStoreAnalytics } from "../../analytics-data";
import {
  AUDIT_EXPORT_CAP,
  AUDIT_PAGE_SIZE,
  AUDIT_VIEW_CAP,
  auditActors,
  auditCategoryLabel,
  auditDetail,
  auditWindow,
  matchesAuditFilters,
  pageAuditEntries,
  parseAuditFilters,
} from "../../audit-log";
import { getAgency, listSuppliers, loadAuditWindow } from "../../data";
import type { OperationContext } from "../../operations/context";
import { planFor } from "../../plans";
import { AUDIT_CATEGORY_LABELS, type AuditCategory } from "../../types";
import { ApiError } from "../auth";
import { dateRange, define, type ApiOperation } from "../define";

/**
 * What the store's Analytics and Activity pages report, read with the same
 * functions those pages and their downloads use, so the API's figures and
 * history match the workspace's exactly. Read only.
 */

const analyticsInput = z.object({
  range: z
    .enum(["7d", "30d", "90d", "12m"])
    .optional()
    .describe("A preset range ending today: 7d, 30d (the default), 90d or 12m. Ignored when `from` and `to` are given."),
  ...dateRange,
});

/**
 * The range asked for, read by the Analytics page's own `parseRange`: a custom
 * range is clipped to today and to MAX_RANGE_DAYS days.
 */
function analyticsRange(input: z.output<typeof analyticsInput>) {
  if (Boolean(input.from) !== Boolean(input.to)) {
    throw new ApiError(422, "invalid_request", "Give both `from` and `to`, or neither.", input.from ? "to" : "from");
  }
  const params = input.from ? { range: "custom", from: input.from, to: input.to } : { range: input.range ?? "30d" };
  return parseRange(params, new Date());
}

const RANGE_NOTE = `\`range\` in the answer is the period actually reported: a custom range is clipped to today and to ${MAX_RANGE_DAYS} days.`;

const categories = Object.keys(AUDIT_CATEGORY_LABELS) as [AuditCategory, ...AuditCategory[]];

async function readActivity(
  ctx: OperationContext,
  input: { from?: string; to?: string; actorId?: string; q?: string; category?: AuditCategory; page: number; limit: number },
) {
  const { store } = ctx;
  // The page's own parser, so a range typed the wrong way round reads the same.
  const filters = parseAuditFilters({
    category: input.category,
    actor: input.actorId,
    from: input.from,
    to: input.to,
    q: input.q,
    page: String(input.page),
  });
  // Every plan reads the history as far as the Activity page does; reading as
  // far as the download goes is for the plans the download comes with.
  const agency = await getAgency(store.agencyId);
  const cap = planFor(agency?.plan).auditExport ? AUDIT_EXPORT_CAP : AUDIT_VIEW_CAP;

  const scope: Record<string, unknown> = { storeId: store.id };
  if (filters.category) scope.category = filters.category;
  const [loaded, suppliers] = await Promise.all([
    loadAuditWindow(scope, auditWindow(filters, store.createdAt, new Date().toISOString()), cap),
    listSuppliers(),
  ]);
  const detail = {
    currency: store.defaultCurrency,
    supplierName: (id: string) => suppliers.find((supplier) => supplier.id === id)?.name,
  };
  const matched = loaded.entries.filter((entry) => matchesAuditFilters(entry, filters));
  const page = pageAuditEntries(matched, filters.page, input.limit);

  return {
    data: page.entries.map((entry) => ({
      id: entry.id,
      at: entry.at,
      category: entry.category,
      categoryLabel: auditCategoryLabel(entry),
      action: entry.action,
      summary: entry.summary,
      detail: auditDetail(entry, detail) || null,
      actor: { id: entry.actorId, name: entry.actorName },
      entity: entry.entity,
      entityId: entry.entityId,
    })),
    page: page.page,
    pages: page.pages,
    total: page.total,
    actors: auditActors(loaded.entries, filters.actorId),
    coveredFrom: loaded.coveredFrom,
    truncated: loaded.truncated,
  };
}

export const reportOperations: ApiOperation[] = [
  define({
    id: "getStoreAnalytics",
    method: "GET",
    path: "/analytics",
    scope: "analytics:read",
    tag: "Analytics",
    summary: "Get the store's sales report",
    description: `The Analytics page for a period: net revenue, gross sales, refunds, orders, units, average order value, refund rate, margin earned (net revenue less supplier base, customisation and shipping cost), and orders that hit an exception with their share of all orders (\`exceptions\`, \`exceptionRate\`), against the same number of days just before; the sales series (daily up to 62 days, weekly beyond); sales by language and by currency; the top products and discount codes. Money is in minor units of the store's default currency (\`currency\`), orders in other currencies converted. ${RANGE_NOTE}`,
    input: analyticsInput,
    run: async (ctx, input) => loadStoreAnalytics(ctx.store, analyticsRange(input)),
  }),
  define({
    id: "getAnalyticsDailySeries",
    method: "GET",
    path: "/analytics/daily",
    scope: "analytics:read",
    tag: "Analytics",
    summary: "Get the store's daily sales",
    description: `One row per day of the period, zero where nothing sold: orders, units, gross sales, refunds, net revenue, margin earned and orders that hit an exception, in minor units of the store's default currency. The same rows as the Analytics page's spreadsheet download. ${RANGE_NOTE}`,
    input: analyticsInput,
    run: async (ctx, input) => {
      const range = analyticsRange(input);
      return { range, currency: ctx.store.defaultCurrency, data: await loadDailySeries(ctx.store, range) };
    },
  }),
  define({
    id: "listActivity",
    method: "GET",
    path: "/activity",
    scope: "activity:read",
    tag: "Activity",
    summary: "List the store's activity history",
    description: `The store's audit history, newest first, filtered as on the Activity page: by days, by the person or API key that made the change (\`actorId\`, from \`actors\`), by category and by words in the entry. Paged by \`page\`. History is read up to ${AUDIT_VIEW_CAP} entries back (${AUDIT_EXPORT_CAP} on plans that include the audit download); \`truncated\` says older entries exist beyond \`coveredFrom\`, so narrow the dates to reach them.`,
    input: z.object({
      ...dateRange,
      actorId: z.string().optional().describe("Only changes made by this person or API key, by id."),
      q: z.string().max(200).optional().describe("Words that must all appear in the entry."),
      category: z.enum(categories).optional().describe(`One of ${categories.join(", ")}.`),
      page: z.coerce.number().int().min(1).default(1).describe("The page, from 1."),
      limit: z.coerce
        .number()
        .int()
        .min(1)
        .max(100)
        .default(AUDIT_PAGE_SIZE)
        .describe(`Entries per page, 1 to 100; ${AUDIT_PAGE_SIZE} unless given.`),
    }),
    run: (ctx, input) => readActivity(ctx, input),
  }),
];

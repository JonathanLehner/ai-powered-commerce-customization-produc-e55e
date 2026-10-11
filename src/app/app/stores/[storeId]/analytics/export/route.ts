import { getTranslations } from "next-intl/server";
import type { NextRequest } from "next/server";
import { parseRange, seriesCsv } from "@/lib/analytics";
import { loadDailySeries } from "@/lib/analytics-data";
import { auditCsvResponse } from "@/lib/audit-log";
import { assertStoreAccess } from "@/lib/session";
import { slugify } from "@/lib/util";

/**
 * The Analytics page's range as a spreadsheet: one row per day, whatever the
 * page buckets by, so the figures can be re-added in any shape. Platform access
 * sees no takings on the page, so it gets no download either.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const t = await getTranslations("analytics");

  let access;
  try {
    access = await assertStoreAccess(storeId, "store.view");
  } catch {
    return new Response(t("accessDenied"), { status: 403 });
  }
  if (access.viaPlatform) return new Response(t("accessDenied"), { status: 403 });

  const { store } = access;
  const range = parseRange(Object.fromEntries(request.nextUrl.searchParams), new Date());
  const series = await loadDailySeries(store, range);
  const currency = store.defaultCurrency;
  const csv = seriesCsv(series, currency, [
    t("csvDate"),
    t("orders"),
    t("units"),
    `${t("csvGross")} (${currency})`,
    `${t("csvRefunds")} (${currency})`,
    `${t("csvNet")} (${currency})`,
  ]);
  const name = slugify(t("fileName", { store: store.name })) || "analytics";
  return auditCsvResponse(csv, `${name}-${range.from}-to-${range.to}.csv`);
}

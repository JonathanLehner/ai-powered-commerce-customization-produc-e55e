import type { NextRequest } from "next/server";
import {
  auditCsv,
  auditCsvResponse,
  auditFileName,
  auditWindow,
  matchesAuditFilters,
  parseAuditFilters,
  AUDIT_EXPORT_CAP,
} from "@/lib/audit-log";
import { listAllStores, loadAuditWindow } from "@/lib/data";
import { assertPlatformAdmin } from "@/lib/session";

/**
 * The platform-wide audit log as a spreadsheet, filtered as the log page was.
 * The store each entry belongs to is a column of its own here, because the
 * platform view spans every one of them.
 */
export async function GET(request: NextRequest) {
  try {
    await assertPlatformAdmin();
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Access denied.", { status: 403 });
  }

  const filters = parseAuditFilters(Object.fromEntries(request.nextUrl.searchParams));
  const stores = await listAllStores();
  const now = new Date();
  const earliest = stores.reduce(
    (oldest, store) => (store.createdAt < oldest ? store.createdAt : oldest),
    now.toISOString(),
  );

  const scope: Record<string, unknown> = {};
  if (filters.category) scope.category = filters.category;
  const { entries } = await loadAuditWindow(
    scope,
    auditWindow(filters, earliest, now.toISOString()),
    AUDIT_EXPORT_CAP,
  );

  const csv = auditCsv(
    entries.filter((entry) => matchesAuditFilters(entry, filters)),
    { storeName: (id) => (id ? (stores.find((store) => store.id === id)?.name ?? id) : "Platform") },
  );
  return auditCsvResponse(csv, auditFileName("Parcelith audit log", filters, now.toISOString().slice(0, 10)));
}
